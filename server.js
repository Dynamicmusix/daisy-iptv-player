#!/usr/bin/env node
/**
 * Daisy IPTV v1.0.0 — Universal Gateway & Local Server
 * - Serves the Daisy IPTV UI (Web / Desktop / Smart TV / Mobile) from public/
 * - Proxies portal API calls (/api/portal) with Set-Top Box headers & cookies
 * - Proxies & remuxes Live MPEG-TS (.ts) and VOD/Series (.mkv/.mp4) streams (/api/stream)
 *   using ffmpeg-static (-c:v copy -c:a aac) so AC-3/EAC-3/MP2/DTS audio and PTS timestamps
 *   play smoothly in every browser & device.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');

let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
} catch (e) {
  console.warn('ffmpeg-static not found, falling back to raw stream passthrough');
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3080;
const WEB_DIR = path.join(__dirname, 'public');

let activeUpstreamStream = null;
let activeStreamMeta = {
  duration: 0,
  isVod: false,
  seekSec: 0,
  vodSession: null,
};

function stopActiveStream() {
  if (activeStreamMeta.vodSession && activeStreamMeta.vodSession.activeUpstream) {
    try {
      if (activeStreamMeta.vodSession.activeUpstream.res) activeStreamMeta.vodSession.activeUpstream.res.destroy();
      if (activeStreamMeta.vodSession.activeUpstream.req) activeStreamMeta.vodSession.activeUpstream.req.destroy();
    } catch (e) {}
    activeStreamMeta.vodSession.activeUpstream = null;
  }
  if (activeUpstreamStream) {
    try {
      if (activeUpstreamStream.ffmpeg) {
        activeUpstreamStream.ffmpeg.kill('SIGKILL');
      }
    } catch (e) {}
    try {
      if (activeUpstreamStream.res) activeUpstreamStream.res.destroy();
      if (activeUpstreamStream.req) activeUpstreamStream.req.destroy();
    } catch (e) {}
    activeUpstreamStream = null;
  }
}

function buildPortalHeaders(mac, stbType, refererHost, token) {
  const safeMac = mac || '00:1A:79:00:00:00';
  const model = stbType || 'MAG250';
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
    'X-User-Agent': `Model: ${model}; Link: WiFi`,
    Accept: '*/*',
    Cookie: `mac=${encodeURIComponent(safeMac)}; stb_lang=en; timezone=UTC`,
    Connection: 'close',
  };
  if (refererHost) {
    headers['Referer'] = refererHost.replace(/\/+$/, '') + '/c/';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function proxyHttpGet(targetUrlStr, headers, cb, redirectCount = 0, isStream = false) {
  if (redirectCount > 6) {
    return cb(new Error('Too many redirects'));
  }
  let parsed;
  try {
    parsed = new URL(targetUrlStr);
  } catch (e) {
    return cb(e);
  }
  const lib = parsed.protocol === 'https:' ? https : http;
  const reqOpts = {
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      ...headers,
      Host: parsed.host,
    },
  };
  if (!isStream) {
    reqOpts.timeout = 20000;
  }

  const upstreamReq = lib.request(reqOpts, (upstreamRes) => {
    if (
      [301, 302, 303, 307, 308].includes(upstreamRes.statusCode) &&
      upstreamRes.headers.location
    ) {
      upstreamRes.resume();
      const nextUrl = new URL(upstreamRes.headers.location, targetUrlStr).toString();
      return proxyHttpGet(nextUrl, headers, cb, redirectCount + 1, isStream);
    }
    cb(null, upstreamRes, upstreamReq);
  });

  upstreamReq.on('error', (err) => cb(err));
  if (!isStream) {
    upstreamReq.on('timeout', () => {
      upstreamReq.destroy(new Error('Upstream request timeout'));
    });
  }
  upstreamReq.end();
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // 1. Portal API Gateway: /api/portal
  if (reqUrl.pathname === '/api/portal') {
    const endpoint = reqUrl.searchParams.get('_endpoint');
    const mac = reqUrl.searchParams.get('_mac');
    const stbType = reqUrl.searchParams.get('_stbType') || 'MAG250';
    const token = reqUrl.searchParams.get('_token') || '';

    if (!endpoint || !mac) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Please configure your Portal Host and MAC address in Daisy IPTV.' }));
    }

    let targetUrl;
    try {
      targetUrl = new URL(endpoint);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid portal endpoint URL' }));
    }

    for (const [k, v] of reqUrl.searchParams.entries()) {
      if (!k.startsWith('_')) {
        targetUrl.searchParams.set(k, v);
      }
    }

    const action = reqUrl.searchParams.get('action') || '';
    const type = reqUrl.searchParams.get('type') || '';
    console.log(`[Daisy IPTV API] ${type}.${action}`);

    const headers = buildPortalHeaders(mac, stbType, targetUrl.origin, token);
    proxyHttpGet(targetUrl.toString(), headers, (err, upstreamRes) => {
      if (err) {
        console.error(`[Daisy IPTV API Error] ${type}.${action}:`, err.message);
        res.writeHead(502, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: err.message }));
      }
      const chunks = [];
      upstreamRes.on('data', (c) => chunks.push(c));
      upstreamRes.on('end', () => {
        const body = Buffer.concat(chunks);
        res.writeHead(upstreamRes.statusCode || 200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        });
        res.end(body);
      });
    });
    return;
  }

  // 2. Stop active stream endpoint
  if (reqUrl.pathname === '/api/stop-stream') {
    stopActiveStream();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ stopped: true }));
  }

  // 2b. Active stream metadata (exact VOD duration parsed from FFmpeg container header)
  if (reqUrl.pathname === '/api/stream-info') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache',
    });
    return res.end(
      JSON.stringify({
        duration: activeStreamMeta.duration || 0,
        isVod: Boolean(activeStreamMeta.isVod),
        seekSec: activeStreamMeta.seekSec || 0,
      })
    );
  }

  // 2c. Smart internal VOD HTTP Range proxy for FFmpeg (-ss fast seeking + single-use token rotation)
  if (reqUrl.pathname === '/api/vod-source') {
    const sid = reqUrl.searchParams.get('sid') || '';
    const session = activeStreamMeta.vodSession;
    if (!session || session.id !== sid) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('VOD session expired');
    }

    // Close previous upstream Range connection immediately so max_connections=1 is respected
    if (session.activeUpstream) {
      try {
        if (session.activeUpstream.res) session.activeUpstream.res.destroy();
        if (session.activeUpstream.req) session.activeUpstream.req.destroy();
      } catch (e) {}
      session.activeUpstream = null;
    }

    const rangeHeader = req.headers.range || '';

    const mintFreshVodTokenUrl = (cb) => {
      if (!session.endpoint || !session.cmd) {
        return cb(new Error('No portal endpoint/cmd for token refresh'));
      }
      try {
        const portalUrl = new URL(session.endpoint);
        portalUrl.searchParams.set('type', 'vod');
        portalUrl.searchParams.set('action', 'create_link');
        portalUrl.searchParams.set('cmd', session.cmd);
        portalUrl.searchParams.set('series', session.series || '');
        portalUrl.searchParams.set('forced_storage', '0');
        portalUrl.searchParams.set('disable_ad', '0');
        portalUrl.searchParams.set('download', '0');
        portalUrl.searchParams.set('force_ch_link_check', '0');
        portalUrl.searchParams.set('JsHttpRequest', '1-xml');

        const pHeaders = buildPortalHeaders(session.mac, session.stbType, portalUrl.origin, session.token);
        proxyHttpGet(portalUrl.toString(), pHeaders, (err, pRes) => {
          if (err) return cb(err);
          const chunks = [];
          pRes.on('data', (c) => chunks.push(c));
          pRes.on('end', () => {
            try {
              const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              const rawCmd = (json && json.js && json.js.cmd) || '';
              const freshUrl = rawCmd.replace(/^(ffmpeg|ffrt\d*|auto)\s+/i, '').trim();
              if (!freshUrl.startsWith('http')) {
                return cb(new Error('Invalid create_link response'));
              }
              session.currentUrl = freshUrl;
              session.urlUsedCount = 0;
              cb(null, freshUrl);
            } catch (parseErr) {
              cb(parseErr);
            }
          });
        });
      } catch (e) {
        cb(e);
      }
    };

    const fetchWithRange = (targetUrl, allowTokenRefresh) => {
      const upHeaders = buildPortalHeaders(session.mac, session.stbType, null, null);
      if (rangeHeader) {
        upHeaders['Range'] = rangeHeader;
      }
      session.urlUsedCount = (session.urlUsedCount || 0) + 1;

      proxyHttpGet(
        targetUrl,
        upHeaders,
        (err, upRes, upReq) => {
          if (err) {
            if (allowTokenRefresh && session.endpoint && session.cmd) {
              return mintFreshVodTokenUrl((mErr, freshUrl) => {
                if (mErr || !freshUrl) {
                  res.writeHead(502);
                  return res.end('Upstream error');
                }
                fetchWithRange(freshUrl, false);
              });
            }
            res.writeHead(502);
            return res.end('Upstream error');
          }

          const ct = (upRes.headers['content-type'] || '').toLowerCase();
          const cl = upRes.headers['content-length'];
          const failedOrExpired =
            (upRes.statusCode && upRes.statusCode >= 400) ||
            cl === '0' ||
            ct.includes('text/html');

          if (failedOrExpired && allowTokenRefresh && session.endpoint && session.cmd) {
            try {
              upRes.destroy();
              upReq.destroy();
            } catch (e) {}
            return mintFreshVodTokenUrl((mErr, freshUrl) => {
              if (mErr || !freshUrl) {
                res.writeHead(upRes.statusCode || 502);
                return res.end('Token refresh failed');
              }
              fetchWithRange(freshUrl, false);
            });
          }

          session.activeUpstream = { res: upRes, req: upReq };
          const outHeaders = {
            'Content-Type': upRes.headers['content-type'] || 'video/mp4',
            'Accept-Ranges': upRes.headers['accept-ranges'] || 'bytes',
          };
          if (upRes.headers['content-length']) {
            outHeaders['Content-Length'] = upRes.headers['content-length'];
          }
          if (upRes.headers['content-range']) {
            outHeaders['Content-Range'] = upRes.headers['content-range'];
          }

          res.writeHead(upRes.statusCode || (rangeHeader ? 206 : 200), outHeaders);
          upRes.pipe(res);

          req.on('close', () => {
            try {
              upRes.destroy();
              upReq.destroy();
            } catch (e) {}
            if (session.activeUpstream && session.activeUpstream.res === upRes) {
              session.activeUpstream = null;
            }
          });
        },
        0,
        true
      );
    };

    // If initial token was already consumed by an earlier Range probe and we have create_link info, try current first and auto-refresh if rejected
    fetchWithRange(session.currentUrl, true);
    return;
  }

  // 3. Live MPEG-TS / VOD Stream Proxy & FFmpeg Remuxer: /api/stream?url=...&mac=...
  if (reqUrl.pathname === '/api/stream') {
    const streamUrl = reqUrl.searchParams.get('url');
    const mac = reqUrl.searchParams.get('mac') || '00:1A:79:00:00:00';
    const stbType = reqUrl.searchParams.get('stbType') || 'MAG250';
    const rawPassthrough = reqUrl.searchParams.get('raw') === '1';
    const isVod = reqUrl.searchParams.get('vod') === '1';
    const seekSec = Math.max(0, parseFloat(reqUrl.searchParams.get('ss') || '0') || 0);
    const endpoint = reqUrl.searchParams.get('endpoint') || '';
    const token = reqUrl.searchParams.get('token') || '';
    const cmd = reqUrl.searchParams.get('cmd') || '';
    const series = reqUrl.searchParams.get('series') || '';

    if (!streamUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Missing url parameter');
    }

    stopActiveStream();
    if (seekSec === 0) {
      activeStreamMeta.duration = 0;
    }
    activeStreamMeta.isVod = isVod;
    activeStreamMeta.seekSec = seekSec;

    const headers = buildPortalHeaders(mac, stbType, null, null);
    if (req.headers.range) {
      headers['Range'] = req.headers.range;
    }

    // 1. VOD or Range Requests (Movies & Series): Direct byte-range proxy for HTML5 video
    if (isVod || req.headers.range || rawPassthrough) {
      proxyHttpGet(
        streamUrl,
        headers,
        (err, upstreamRes, upstreamReq) => {
          if (err) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
            return res.end(`Stream Error: ${err.message}`);
          }

          if (upstreamRes.statusCode && upstreamRes.statusCode >= 400) {
            res.writeHead(upstreamRes.statusCode, { 'Content-Type': 'text/plain' });
            return res.end(`Upstream returned HTTP ${upstreamRes.statusCode}`);
          }

          activeUpstreamStream = { res: upstreamRes, req: upstreamReq };

          const outHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Accept, Origin, Content-Type, Authorization, X-Requested-With',
            'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
            'Accept-Ranges': upstreamRes.headers['accept-ranges'] || 'bytes',
            'Cache-Control': isVod ? 'public, max-age=3600' : 'no-cache, no-store',
          };
          if (upstreamRes.headers['content-range']) {
            outHeaders['Content-Range'] = upstreamRes.headers['content-range'];
          }
          if (upstreamRes.headers['content-length']) {
            outHeaders['Content-Length'] = upstreamRes.headers['content-length'];
          }
          if (upstreamRes.headers['content-type']) {
            outHeaders['Content-Type'] = upstreamRes.headers['content-type'];
          } else {
            outHeaders['Content-Type'] = 'video/mp4';
          }

          const statusCode = upstreamRes.statusCode || (req.headers.range ? 206 : 200);
          res.writeHead(statusCode, outHeaders);

          if (req.method === 'HEAD') {
            try { upstreamRes.destroy(); upstreamReq.destroy(); } catch (e) {}
            return res.end();
          }

          upstreamRes.pipe(res);
          req.on('close', () => {
            try {
              upstreamRes.destroy();
              upstreamReq.destroy();
            } catch (e) {}
            if (activeUpstreamStream && activeUpstreamStream.res === upstreamRes) {
              activeUpstreamStream = null;
            }
          });
        },
        0,
        true
      );
      return;
    }

    // 2. Live TV (MPEG-TS): Stream with audio transcoding (AAC) via FFmpeg or passthrough

    proxyHttpGet(
      streamUrl,
      headers,
      (err, upstreamRes, upstreamReq) => {
        if (err) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          return res.end(`Stream Error: ${err.message}`);
        }

        if (upstreamRes.statusCode && upstreamRes.statusCode >= 400) {
          res.writeHead(upstreamRes.statusCode, { 'Content-Type': 'text/plain' });
          return res.end(`Upstream returned HTTP ${upstreamRes.statusCode}`);
        }

        if (ffmpegPath && !rawPassthrough) {
          const ffArgs = [
            '-hide_banner',
            '-loglevel', 'error',
            '-fflags', '+genpts+igndts+nobuffer+discardcorrupt',
            '-flags', 'low_delay',
            '-analyzeduration', '1200000',
            '-probesize', '1200000',
            '-i', 'pipe:0',
            '-map', '0:v:0',
            '-map', '0:a:0?',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-ac', '2',
            '-ar', '44100',
            '-b:a', '128k',
            '-muxdelay', '0',
            '-muxpreload', '0',
            '-f', 'mpegts',
            'pipe:1',
          ];

          const ffProc = spawn(ffmpegPath, ffArgs, {
            stdio: ['pipe', 'pipe', 'pipe'],
          });

          activeUpstreamStream = { res: upstreamRes, req: upstreamReq, ffmpeg: ffProc };

          res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store, no-cache',
            'Content-Type': 'video/mp2t',
            Connection: 'close',
          });

          upstreamRes.pipe(ffProc.stdin);
          ffProc.stdin.on('error', () => {});
          ffProc.stdout.pipe(res);

          const cleanup = () => {
            try { ffProc.kill('SIGKILL'); } catch (e) {}
            try { upstreamRes.destroy(); upstreamReq.destroy(); } catch (e) {}
            if (activeUpstreamStream && activeUpstreamStream.ffmpeg === ffProc) {
              activeUpstreamStream = null;
            }
          };

          req.on('close', cleanup);
          ffProc.on('close', () => {
            try { res.end(); } catch (e) {}
          });
          return;
        }

        const outHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
          'Content-Type': upstreamRes.headers['content-type'] || 'video/mp2t',
        };
        if (upstreamRes.headers['content-length']) {
          outHeaders['Content-Length'] = upstreamRes.headers['content-length'];
        }
        if (upstreamRes.headers['content-range']) {
          outHeaders['Content-Range'] = upstreamRes.headers['content-range'];
        }
        if (upstreamRes.headers['accept-ranges']) {
          outHeaders['Accept-Ranges'] = upstreamRes.headers['accept-ranges'];
        }

        res.writeHead(upstreamRes.statusCode || 200, outHeaders);
        upstreamRes.pipe(res);
        req.on('close', () => {
          try {
            upstreamRes.destroy();
            upstreamReq.destroy();
          } catch (e) {}
          if (activeUpstreamStream && activeUpstreamStream.res === upstreamRes) {
            activeUpstreamStream = null;
          }
        });
      },
      0,
      true
    );
    return;
  }

  // 4. Static UI files
  let filePath = reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname;
  const resolvedPath = path.join(WEB_DIR, path.normalize(filePath));
  if (!resolvedPath.startsWith(WEB_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(resolvedPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeMap = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    };
    res.writeHead(200, {
      'Content-Type': mimeMap[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(` Daisy IPTV v1.0.0 (Web • Android TV • Mobile • iOS • Apple TV)`);
  console.log(` FFmpeg Engine : ${ffmpegPath || 'Disabled'}`);
  console.log(` Local URL     : http://localhost:${PORT}`);
  console.log(`================================================================`);
});
