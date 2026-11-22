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

function stopActiveStream() {
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

  // 3. Live MPEG-TS / VOD Stream Proxy & FFmpeg Remuxer: /api/stream?url=...&mac=...
  if (reqUrl.pathname === '/api/stream') {
    const streamUrl = reqUrl.searchParams.get('url');
    const mac = reqUrl.searchParams.get('mac') || '00:1A:79:00:00:00';
    const stbType = reqUrl.searchParams.get('stbType') || 'MAG250';
    const download = reqUrl.searchParams.get('download') === '1';
    const rawPassthrough = reqUrl.searchParams.get('raw') === '1' || download;

    if (!streamUrl) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Missing url parameter');
    }

    if (!download) {
      stopActiveStream();
    }

    const headers = buildPortalHeaders(mac, stbType, null, null);
    if (req.headers.range && rawPassthrough) {
      headers['Range'] = req.headers.range;
    }

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

        if (!download) {
          activeUpstreamStream = { res: upstreamRes, req: upstreamReq, ffmpeg: null };
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
        if (download) {
          const ext = reqUrl.searchParams.get('ext') || 'ts';
          outHeaders['Content-Disposition'] = `attachment; filename="daisy_iptv_record_${Date.now()}.${ext}"`;
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
