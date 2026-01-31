const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;

// PostgreSQL connection pool
const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'symbia',
  user: process.env.POSTGRES_USER || 'symbia',
  password: process.env.POSTGRES_PASSWORD || 'symbia',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Database introspection helper functions
async function getTables() {
  const result = await pgPool.query(`
    SELECT
      t.table_schema,
      t.table_name,
      t.table_type,
      pg_catalog.obj_description(c.oid, 'pg_class') as description,
      (SELECT count(*) FROM information_schema.columns WHERE table_schema = t.table_schema AND table_name = t.table_name) as column_count
    FROM information_schema.tables t
    LEFT JOIN pg_catalog.pg_class c ON c.relname = t.table_name
    LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
    WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY t.table_schema, t.table_name
  `);
  return result.rows;
}

async function getTableSchema(schema, table) {
  const columnsResult = await pgPool.query(`
    SELECT
      c.column_name,
      c.data_type,
      c.udt_name,
      c.is_nullable,
      c.column_default,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      pg_catalog.col_description(
        (SELECT oid FROM pg_catalog.pg_class WHERE relname = c.table_name AND relnamespace = (SELECT oid FROM pg_catalog.pg_namespace WHERE nspname = c.table_schema)),
        c.ordinal_position
      ) as description
    FROM information_schema.columns c
    WHERE c.table_schema = $1 AND c.table_name = $2
    ORDER BY c.ordinal_position
  `, [schema, table]);

  const constraintsResult = await pgPool.query(`
    SELECT
      tc.constraint_name,
      tc.constraint_type,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = $1 AND tc.table_name = $2
  `, [schema, table]);

  const indexesResult = await pgPool.query(`
    SELECT
      i.relname as index_name,
      a.attname as column_name,
      ix.indisunique as is_unique,
      ix.indisprimary as is_primary
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = $1 AND t.relname = $2
    ORDER BY i.relname
  `, [schema, table]);

  return {
    columns: columnsResult.rows,
    constraints: constraintsResult.rows,
    indexes: indexesResult.rows,
  };
}

async function getTableData(schema, table, limit = 100, offset = 0) {
  // Validate table name to prevent SQL injection
  const tableCheck = await pgPool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = $1 AND table_name = $2
  `, [schema, table]);

  if (tableCheck.rows.length === 0) {
    throw new Error('Table not found');
  }

  // Get total count
  const countResult = await pgPool.query(
    `SELECT count(*) as total FROM "${schema}"."${table}"`
  );
  const total = parseInt(countResult.rows[0].total);

  // Get data
  const dataResult = await pgPool.query(
    `SELECT * FROM "${schema}"."${table}" LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return {
    data: dataResult.rows,
    total,
    limit,
    offset,
    columns: dataResult.fields.map(f => ({
      name: f.name,
      dataTypeID: f.dataTypeID,
    })),
  };
}

async function executeQuery(sql) {
  // Only allow SELECT statements for safety
  const trimmedSql = sql.trim().toLowerCase();
  if (!trimmedSql.startsWith('select')) {
    throw new Error('Only SELECT queries are allowed');
  }

  // Block dangerous keywords
  const dangerous = ['insert', 'update', 'delete', 'drop', 'alter', 'truncate', 'create', 'grant', 'revoke'];
  for (const keyword of dangerous) {
    if (trimmedSql.includes(keyword)) {
      throw new Error(`Query contains forbidden keyword: ${keyword}`);
    }
  }

  const result = await pgPool.query(sql);
  return {
    rows: result.rows,
    rowCount: result.rowCount,
    fields: result.fields.map(f => ({
      name: f.name,
      dataTypeID: f.dataTypeID,
    })),
  };
}

// Helper to parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Send JSON response helper
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

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

const server = http.createServer(async (req, res) => {
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

  // Database introspection endpoints
  // GET /db/tables - List all tables
  if (req.url === '/db/tables' && req.method === 'GET') {
    try {
      const tables = await getTables();
      sendJson(res, 200, { tables });
    } catch (err) {
      console.error('Error fetching tables:', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /db/tables/:schema/:table/schema - Get table schema
  const schemaMatch = req.url.match(/^\/db\/tables\/([^\/]+)\/([^\/]+)\/schema$/);
  if (schemaMatch && req.method === 'GET') {
    try {
      const schema = await getTableSchema(
        decodeURIComponent(schemaMatch[1]),
        decodeURIComponent(schemaMatch[2])
      );
      sendJson(res, 200, schema);
    } catch (err) {
      console.error('Error fetching schema:', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /db/tables/:schema/:table/data - Get table data
  const dataMatch = req.url.match(/^\/db\/tables\/([^\/]+)\/([^\/]+)\/data(\?.*)?$/);
  if (dataMatch && req.method === 'GET') {
    try {
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '100'), 1000);
      const offset = parseInt(urlObj.searchParams.get('offset') || '0');
      const data = await getTableData(
        decodeURIComponent(dataMatch[1]),
        decodeURIComponent(dataMatch[2]),
        limit,
        offset
      );
      sendJson(res, 200, data);
    } catch (err) {
      console.error('Error fetching data:', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // POST /db/query - Execute read-only query
  if (req.url === '/db/query' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.sql) {
        sendJson(res, 400, { error: 'Missing sql field' });
        return;
      }
      const result = await executeQuery(body.sql);
      sendJson(res, 200, result);
    } catch (err) {
      console.error('Error executing query:', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /db/health - Database health check
  if (req.url === '/db/health' && req.method === 'GET') {
    try {
      const result = await pgPool.query('SELECT version(), current_database(), current_user');
      sendJson(res, 200, {
        status: 'healthy',
        version: result.rows[0].version,
        database: result.rows[0].current_database,
        user: result.rows[0].current_user,
      });
    } catch (err) {
      console.error('Database health check failed:', err.message);
      sendJson(res, 503, { status: 'unhealthy', error: err.message });
    }
    return;
  }

  res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ⚡ Service Admin running on port ${PORT}\n`);
});
