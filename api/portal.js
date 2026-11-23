/**
 * Daisy IPTV v1.0.0 - Vercel Serverless Function: /api/portal
 * Proxies portal API requests with Set-Top Box headers & MAC cookies.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

function buildPortalHeaders(mac, stbType, refererHost, token) {
  const safeMac = mac || '00:1A:79:00:00:00';
  const model = stbType || 'MAG250';
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 250 Safari/533.3',
    'X-User-Agent': `Model: ${model}; Link: WiFi`,
    Accept: '*/*',
    Cookie: `mac=${safeMac}; stb_lang=en; timezone=UTC`,
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

function proxyGet(targetUrlStr, headers, cb, redirectCount = 0) {
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
    timeout: 20000,
  };

  const upstreamReq = lib.request(reqOpts, (upstreamRes) => {
    if (
      [301, 302, 303, 307, 308].includes(upstreamRes.statusCode) &&
      upstreamRes.headers.location
    ) {
      upstreamRes.resume();
      const nextUrl = new URL(upstreamRes.headers.location, targetUrlStr).toString();
      return proxyGet(nextUrl, headers, cb, redirectCount + 1);
    }
    cb(null, upstreamRes);
  });

  upstreamReq.on('error', (err) => cb(err));
  upstreamReq.on('timeout', () => upstreamReq.destroy(new Error('Upstream timeout')));
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

  const headers = buildPortalHeaders(mac, stbType, targetUrl.origin, token);
  proxyGet(targetUrl.toString(), headers, (err, upstreamRes) => {
    if (err) {
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
};
