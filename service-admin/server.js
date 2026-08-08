// ESM, not CommonJS. @symbia/sys is an ESM package, and `require()` of it
// works on Node 22.12+ but NOT on the node:20-alpine image this service ships
// in -- so a CJS build would have passed locally and failed in the container.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  resolveServicePort,
  resolveServiceHost,
  ServiceId,
  ServicePorts,
  RunningServices,
} from '@symbia/sys';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Registered as ServiceId.API (9000). This service previously ran on 3000
// with no entry in the platform registry at all (F1) -- a service holding
// direct Postgres credentials to six databases, proxying to every other
// service, and invisible to the registry that is supposed to gate exactly
// that. Registering it does not settle whether it should exist in this
// form; see docs/2026-08-06-control-center-rebuild.md 8.2.
const PORT = resolveServicePort(ServiceId.API);
const IDENTITY_HOST = process.env.IDENTITY_HOST || 'identity';
const IDENTITY_PORT = resolveServicePort(ServiceId.IDENTITY);

// Service databases - each service has its own database
const SERVICE_DATABASES = [
  'identity',
  'logging',
  'catalog',
  'messaging',
  'runtime',
  'assistants'
];

// PostgreSQL connection pools - one per database
const pgPools = {};

function getPool(database) {
  if (!pgPools[database]) {
    pgPools[database] = new Pool({
      host: process.env.POSTGRES_HOST || 'postgres',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: database,
      user: process.env.POSTGRES_USER || 'symbia',
      password: process.env.POSTGRES_PASSWORD || 'symbia_dev',
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pgPools[database];
}

// Verify user is super admin via Identity service
async function verifySuperAdmin(token) {
  if (!token) return null;

  try {
    const response = await fetch(`http://${IDENTITY_HOST}:${IDENTITY_PORT}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.user?.isSuperAdmin) {
      return data.user;
    }
    return null;
  } catch (err) {
    console.error('Auth verification failed:', err.message);
    return null;
  }
}

// Extract bearer token from request
function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

// Database introspection helper functions
async function getTables(pool) {
  const result = await pool.query(`
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

async function getTableSchema(pool, schema, table) {
  const columnsResult = await pool.query(`
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

  const constraintsResult = await pool.query(`
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

  const indexesResult = await pool.query(`
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

async function getTableData(pool, schema, table, limit = 100, offset = 0) {
  // Validate table name to prevent SQL injection
  const tableCheck = await pool.query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = $1 AND table_name = $2
  `, [schema, table]);

  if (tableCheck.rows.length === 0) {
    throw new Error('Table not found');
  }

  // Get total count
  const countResult = await pool.query(
    `SELECT count(*) as total FROM "${schema}"."${table}"`
  );
  const total = parseInt(countResult.rows[0].total);

  // Get data
  const dataResult = await pool.query(
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

async function executeQuery(pool, sql) {
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

  const result = await pool.query(sql);
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

// Service routing, derived from @symbia/sys (F2).
//
// This was a hand-maintained map keyed by PORT, carrying its own copy of every
// port number, in a service that was itself absent from the platform registry
// (F1). `network: 5054` outlived the move to 5009 in exactly the way a
// restated constant does.
//
// Routes are addressed by service ID now. Ports are looked up, never written.

// resolveServiceHost is the one implementation of this. It used to default to
// the docker service name here and to localhost in the control center -- two
// proxies disagreeing about where a service lives. Compose now sets *_HOST
// explicitly rather than either of them guessing.
const SERVICE_HOSTS = Object.fromEntries(
  RunningServices.map((id) => [id, resolveServiceHost(id)])
);
SERVICE_HOSTS.postgres = process.env.POSTGRES_HOST || 'postgres';

const SERVICE_PORTS = {
  ...ServicePorts,
  postgres: parseInt(process.env.POSTGRES_PORT || '5432', 10),
};

// Reverse lookup, kept ONLY so the legacy /proxy/:port/* form still resolves
// while the console's own HTML still emits it. The port form is the defect;
// it is accepted, not endorsed, and should go when index.html is updated.
const PORT_TO_ID = Object.fromEntries(
  Object.entries(SERVICE_PORTS).map(([id, port]) => [String(port), id])
);

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
    res.end(JSON.stringify({ status: 'healthy', service: ServiceId.API }));
    return;
  }

  // GET /api/stats
  //
  // Every other service answers this, and the console asks every service the
  // same question. This one 404'd, so its Overview tile showed a name, a
  // latency and nothing else.
  //
  // Reports only what this process actually knows without asking anything
  // else: how many service routes it can resolve, how many database pools it
  // holds open, and how long it has been up. Deliberately NOT the database
  // list — that requires super-admin and a live query per database, and a
  // metric that can fail is not a metric, it is a second health check wearing
  // one's clothes.
  if (req.url === '/api/stats' && req.method === 'GET') {
    sendJson(res, 200, {
      proxiedServices: Object.keys(SERVICE_HOSTS).length,
      openPools: Object.keys(pgPools).length,
      uptimeSeconds: Math.floor(process.uptime()),
    });
    return;
  }

  // Proxy API requests to services
  // Format: /proxy/:port/*path
  const proxyMatch = req.url.match(/^\/proxy\/([^/]+)(\/.*)?$/);
  if (proxyMatch) {
    const key = decodeURIComponent(proxyMatch[1]);
    // Accept either a service id (preferred) or a bare port (legacy).
    const serviceId = /^\d+$/.test(key) ? PORT_TO_ID[key] : key;
    const targetPort = SERVICE_PORTS[serviceId];
    const targetPath = proxyMatch[2] || '/';
    const targetHost = SERVICE_HOSTS[serviceId];

    // An unregistered target is refused rather than silently sent to
    // localhost, which is what the old `|| 'localhost'` fallback did -- it
    // turned a routing mistake into a connection to whatever happened to be
    // listening.
    if (!targetPort || !targetHost) {
      sendJson(res, 404, {
        error: 'unknown_service',
        requested: key,
        known: Object.keys(SERVICE_HOSTS),
      });
      return;
    }

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

  // ==========================================
  // Database endpoints - require super admin
  // ==========================================

  // GET /db/databases - List available databases
  if (req.url === '/db/databases' && req.method === 'GET') {
    const token = extractToken(req);
    const user = await verifySuperAdmin(token);
    if (!user) {
      sendJson(res, 401, { error: 'Super admin access required' });
      return;
    }

    // Check which databases are accessible
    const available = [];
    for (const db of SERVICE_DATABASES) {
      try {
        const pool = getPool(db);
        await pool.query('SELECT 1');
        available.push(db);
      } catch (err) {
        // Database not available, skip it
      }
    }

    sendJson(res, 200, { databases: available });
    return;
  }

  // GET /db/:database/tables - List all tables in a database
  const tablesMatch = req.url.match(/^\/db\/([^\/]+)\/tables$/);
  if (tablesMatch && req.method === 'GET') {
    const token = extractToken(req);
    const user = await verifySuperAdmin(token);
    if (!user) {
      sendJson(res, 401, { error: 'Super admin access required' });
      return;
    }

    const database = decodeURIComponent(tablesMatch[1]);
    if (!SERVICE_DATABASES.includes(database)) {
      sendJson(res, 400, { error: 'Invalid database' });
      return;
    }

    try {
      const pool = getPool(database);
      const tables = await getTables(pool);
      sendJson(res, 200, { database, tables });
    } catch (err) {
      console.error('Error fetching tables:', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /db/:database/tables/:schema/:table/schema - Get table schema
  const schemaMatch = req.url.match(/^\/db\/([^\/]+)\/tables\/([^\/]+)\/([^\/]+)\/schema$/);
  if (schemaMatch && req.method === 'GET') {
    const token = extractToken(req);
    const user = await verifySuperAdmin(token);
    if (!user) {
      sendJson(res, 401, { error: 'Super admin access required' });
      return;
    }

    const database = decodeURIComponent(schemaMatch[1]);
    if (!SERVICE_DATABASES.includes(database)) {
      sendJson(res, 400, { error: 'Invalid database' });
      return;
    }

    try {
      const pool = getPool(database);
      const schema = await getTableSchema(
        pool,
        decodeURIComponent(schemaMatch[2]),
        decodeURIComponent(schemaMatch[3])
      );
      sendJson(res, 200, schema);
    } catch (err) {
      console.error('Error fetching schema:', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /db/:database/tables/:schema/:table/data - Get table data
  const dataMatch = req.url.match(/^\/db\/([^\/]+)\/tables\/([^\/]+)\/([^\/]+)\/data(\?.*)?$/);
  if (dataMatch && req.method === 'GET') {
    const token = extractToken(req);
    const user = await verifySuperAdmin(token);
    if (!user) {
      sendJson(res, 401, { error: 'Super admin access required' });
      return;
    }

    const database = decodeURIComponent(dataMatch[1]);
    if (!SERVICE_DATABASES.includes(database)) {
      sendJson(res, 400, { error: 'Invalid database' });
      return;
    }

    try {
      const pool = getPool(database);
      const urlObj = new URL(req.url, `http://${req.headers.host}`);
      const limit = Math.min(parseInt(urlObj.searchParams.get('limit') || '100'), 1000);
      const offset = parseInt(urlObj.searchParams.get('offset') || '0');
      const data = await getTableData(
        pool,
        decodeURIComponent(dataMatch[2]),
        decodeURIComponent(dataMatch[3]),
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

  // POST /db/:database/query - Execute read-only query
  const queryMatch = req.url.match(/^\/db\/([^\/]+)\/query$/);
  if (queryMatch && req.method === 'POST') {
    const token = extractToken(req);
    const user = await verifySuperAdmin(token);
    if (!user) {
      sendJson(res, 401, { error: 'Super admin access required' });
      return;
    }

    const database = decodeURIComponent(queryMatch[1]);
    if (!SERVICE_DATABASES.includes(database)) {
      sendJson(res, 400, { error: 'Invalid database' });
      return;
    }

    try {
      const pool = getPool(database);
      const body = await parseBody(req);
      if (!body.sql) {
        sendJson(res, 400, { error: 'Missing sql field' });
        return;
      }
      const result = await executeQuery(pool, body.sql);
      sendJson(res, 200, result);
    } catch (err) {
      console.error('Error executing query:', err.message);
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /db/:database/health - Database health check (still requires auth)
  const healthMatch = req.url.match(/^\/db\/([^\/]+)\/health$/);
  if (healthMatch && req.method === 'GET') {
    const token = extractToken(req);
    const user = await verifySuperAdmin(token);
    if (!user) {
      sendJson(res, 401, { error: 'Super admin access required' });
      return;
    }

    const database = decodeURIComponent(healthMatch[1]);
    if (!SERVICE_DATABASES.includes(database)) {
      sendJson(res, 400, { error: 'Invalid database' });
      return;
    }

    try {
      const pool = getPool(database);
      const result = await pool.query('SELECT version(), current_database(), current_user');
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

  // Legacy endpoints for backwards compatibility (unauthenticated health only)
  if (req.url === '/db/health' && req.method === 'GET') {
    try {
      const pool = getPool('identity');
      const result = await pool.query('SELECT version(), current_database(), current_user');
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
  console.log(`\n  ⚡ Symbia API (service-admin) on port ${PORT}\n`);
});
