const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Service routing map (port -> Docker service name)
const SERVICE_MAP = {
  '5001': process.env.IDENTITY_HOST || 'identity',
  '5002': process.env.LOGGING_HOST || 'logging',
  '5003': process.env.CATALOG_HOST || 'catalog',
  '5004': process.env.ASSISTANTS_HOST || 'assistants',
  '5005': process.env.MESSAGING_HOST || 'messaging',
  '5006': process.env.RUNTIME_HOST || 'runtime',
  '5007': process.env.INTEGRATIONS_HOST || 'integrations',
  '5054': process.env.NETWORK_HOST || 'network',
  '5432': process.env.POSTGRES_HOST || 'postgres'
};

const server = http.createServer((req, res) => {
  // CORS preflight - handle FIRST before anything else
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // Serve the dashboard
  if (req.url === '/' || req.url === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Health check
  if (req.url === '/health' || req.url === '/health/live') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', service: 'service-admin' }));
    return;
  }

  // Proxy API requests to services
  // Format: /proxy/:port/*path
  const proxyMatch = req.url.match(/^\/proxy\/(\d+)(\/.*)?$/);
  if (proxyMatch) {
    const targetPort = proxyMatch[1];
    const targetPath = proxyMatch[2] || '/';
    const targetHost = SERVICE_MAP[targetPort] || 'localhost';

    // Forward headers but fix host
    const forwardHeaders = { ...req.headers };
    forwardHeaders.host = `${targetHost}:${targetPort}`;

    const options = {
      hostname: targetHost,
      port: parseInt(targetPort),
      path: targetPath,
      method: req.method,
      headers: forwardHeaders
    };

    const proxyReq = http.request(options, (proxyRes) => {
      // Add CORS headers to response
      const responseHeaders = { ...proxyRes.headers };
      responseHeaders['Access-Control-Allow-Origin'] = '*';

      res.writeHead(proxyRes.statusCode, responseHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`Proxy error to ${targetHost}:${targetPort}${targetPath}:`, err.message);
      res.writeHead(502, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        error: 'Service unavailable',
        message: err.message,
        target: `${targetHost}:${targetPort}${targetPath}`
      }));
    });

    req.pipe(proxyReq);
    return;
  }

  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ⚡ Service Admin running on port ${PORT}\n`);
});
