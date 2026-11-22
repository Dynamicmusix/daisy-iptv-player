/**
 * Daisy IPTV v1.0.0 - Vercel Serverless Function: /api/stop-stream
 */
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ stopped: true }));
};
