import type { Express } from "express";
import { registerDocRoutes } from "@symbia/md";
import { openApiSpec } from "./openapi";

/**
 * Register all documentation routes following the standardized Symbia pattern
 */
export function setupDocRoutes(app: Express) {
  registerDocRoutes(app, {
    spec: openApiSpec,
    docsRoot: "docs",
    includeWellKnown: false,
  });

  // Additional HTML dashboard for the logging service
  app.get("/docs", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Symbia Logging Service - API Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 2rem;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      padding: 3rem;
    }
    h1 { color: #667eea; margin-bottom: 0.5rem; font-size: 2.5rem; }
    .tagline { color: #888; margin-bottom: 2rem; font-size: 1.1rem; }
    h2 { color: #764ba2; margin-top: 2rem; margin-bottom: 1rem; border-bottom: 2px solid #f0f0f0; padding-bottom: 0.5rem; }
    ul { list-style: none; }
    li { margin: 1rem 0; }
    a {
      color: #667eea;
      text-decoration: none;
      font-weight: 600;
      transition: all 0.3s ease;
      padding: 0.5rem 0;
      display: inline-block;
    }
    a:hover { color: #764ba2; transform: translateX(5px); }
    .desc { color: #888; font-size: 0.9rem; margin-left: 0.5rem; font-weight: normal; }
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin: 1.5rem 0;
    }
    .feature {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 8px;
      text-align: center;
    }
    .feature h3 { color: #667eea; font-size: 1rem; margin-bottom: 0.5rem; }
    .feature p { color: #666; font-size: 0.85rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📊 Symbia Logging Service</h1>
    <p class="tagline">Comprehensive observability platform for logs, metrics, traces, and objects</p>

    <div class="feature-grid">
      <div class="feature">
        <h3>📝 Logs</h3>
        <p>Structured log management</p>
      </div>
      <div class="feature">
        <h3>📈 Metrics</h3>
        <p>Time-series data points</p>
      </div>
      <div class="feature">
        <h3>🔍 Traces</h3>
        <p>Distributed tracing</p>
      </div>
      <div class="feature">
        <h3>📦 Objects</h3>
        <p>Binary object storage</p>
      </div>
    </div>

    <h2>📚 API Documentation</h2>
    <ul>
      <li><a href="/docs/llms.txt">llms.txt</a> <span class="desc">- Quick reference for LLMs</span></li>
      <li><a href="/docs/llms-full.txt">llms-full.txt</a> <span class="desc">- Complete API documentation</span></li>
      <li><a href="/docs/openapi.json">openapi.json</a> <span class="desc">- OpenAPI 3.0 specification</span></li>
    </ul>

    <h2>🔐 Authentication</h2>
    <ul>
      <li><strong>Bearer Token:</strong> <code>Authorization: Bearer &lt;token&gt;</code></li>
      <li><strong>API Key:</strong> <code>X-API-Key: &lt;key&gt;</code></li>
    </ul>

    <h2>📍 Required Headers</h2>
    <ul>
      <li><code>X-Org-Id</code> - Organization identifier</li>
      <li><code>X-Service-Id</code> - Service identifier</li>
      <li><code>X-Env</code> - Environment (dev|stage|prod)</li>
      <li><code>X-Data-Class</code> - Data classification</li>
      <li><code>X-Policy-Ref</code> - Policy reference</li>
    </ul>
  </div>
</body>
</html>
    `);
  });
}
