/**
 * Daisy IPTV v1.0.0 - Vercel Serverless Function: /api/stream
 * Follows 302 edge redirects and streams MPEG-TS / MKV video.
 * Uses ffmpeg-static when available to copy H.264 video and transcode AC-3/MP2 audio to AAC.
 */

const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { URL } = require('url');

let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
} catch (e) {}

function buildPortalHeaders(mac, stbType) {
  const safeMac = mac || '00:1A:79:00:00:00';
  const model = stbType || 'MAG250';
  return {
    'User-Agent':
      'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
    'X-User-Agent': `Model: ${model}; Link: WiFi`,
    Accept: '*/*',
    Cookie: `mac=${encodeURIComponent(safeMac)}; stb_lang=en; timezone=UTC`,
    Connection: 'close',
  };
}

function proxyStreamGet(targetUrlStr, headers, cb, redirectCount = 0) {
  if (redirectCount > 6) return cb(new Error('Too many redirects'));
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
    headers: { ...headers, Host: parsed.host },
  };

  const upstreamReq = lib.request(reqOpts, (upstreamRes) => {
    if (
      [301, 302, 303, 307, 308].includes(upstreamRes.statusCode) &&
      upstreamRes.headers.location
    ) {
      upstreamRes.resume();
      const nextUrl = new URL(upstreamRes.headers.location, targetUrlStr).toString();
      return proxyStreamGet(nextUrl, headers, cb, redirectCount + 1);
    }
    cb(null, upstreamRes, upstreamReq);
  });

  upstreamReq.on('error', (err) => cb(err));
  upstreamReq.end();
}

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const streamUrl = reqUrl.searchParams.get('url');
  const mac = reqUrl.searchParams.get('mac') || '00:1A:79:00:00:00';
  const stbType = reqUrl.searchParams.get('stbType') || 'MAG250';
  const rawPassthrough = reqUrl.searchParams.get('raw') === '1';
  const isVod = reqUrl.searchParams.get('vod') === '1';
  const seekSec = Math.max(0, parseFloat(reqUrl.searchParams.get('ss') || '0') || 0);

  if (!streamUrl) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Missing url parameter');
  }

  const headers = buildPortalHeaders(mac, stbType);
  if (req.headers.range && rawPassthrough) {
    headers['Range'] = req.headers.range;
  }

  if (isVod && seekSec > 0 && ffmpegPath && !rawPassthrough) {
    try {
      const ffArgs = [
        '-hide_banner',
        '-loglevel', 'error',
        '-user_agent', headers['User-Agent'],
        '-headers', `X-User-Agent: ${headers['X-User-Agent']}\r\nCookie: ${headers['Cookie']}\r\n`,
        '-ss', String(seekSec),
        '-fflags', '+genpts+igndts+discardcorrupt',
        '-i', streamUrl,
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
      const ffProc = spawn(ffmpegPath, ffArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store, no-cache',
        'Content-Type': 'video/mp2t',
        Connection: 'close',
      });
      ffProc.stdout.pipe(res);
      req.on('close', () => {
        try { ffProc.kill('SIGKILL'); } catch (e) {}
      });
      ffProc.on('close', () => {
        try { res.end(); } catch (e) {}
      });
      return;
    } catch (e) {}
  }

  proxyStreamGet(streamUrl, headers, (err, upstreamRes, upstreamReq) => {
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

      try {
        const ffProc = spawn(ffmpegPath, ffArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
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
        };
        req.on('close', cleanup);
        ffProc.on('close', () => {
          try { res.end(); } catch (e) {}
        });
        return;
      } catch (spawnErr) {
        // Fallback to direct passthrough if serverless runtime restricts child binary
      }
    }

    const outHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      'Content-Type': upstreamRes.headers['content-type'] || 'video/mp2t',
    };
    if (upstreamRes.headers['content-length']) {
      outHeaders['Content-Length'] = upstreamRes.headers['content-length'];
    }

    res.writeHead(upstreamRes.statusCode || 200, outHeaders);
    upstreamRes.pipe(res);
    req.on('close', () => {
      try { upstreamRes.destroy(); upstreamReq.destroy(); } catch (e) {}
    });
  });
};
