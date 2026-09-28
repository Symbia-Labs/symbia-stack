import { createRequire as __symbiaCreateRequire } from "node:module";globalThis.require ??= __symbiaCreateRequire(import.meta.url);

// build/plugin/symbia-imagine/vendor/symbia-md/dist/routes.js
import fs from "fs";
import path from "path";
function sendDocFile(res, docsRoot, filename, contentType) {
  const filePath = path.join(docsRoot, filename);
  if (fs.existsSync(filePath)) {
    res.type(contentType).sendFile(filePath);
  } else {
    res.status(404).json({
      error: "Document not found. Run build to generate docs."
    });
  }
}
function registerDocRoutes(app, config) {
  const docsRoot = path.resolve(process.cwd(), config.docsRoot || "client/public");
  app.get("/", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/docs/openapi.json", (_req, res) => {
    const filePath = path.join(docsRoot, "openapi.json");
    if (fs.existsSync(filePath)) {
      res.type("application/json").sendFile(filePath);
    } else {
      res.type("application/json").json(config.spec);
    }
  });
  app.get("/api/docs/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/openapi.json", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/api/docs", (_req, res) => {
    res.redirect(302, "/docs/openapi.json");
  });
  app.get("/docs/llms.txt", (_req, res) => {
    sendDocFile(res, docsRoot, "llms.txt", "text/plain");
  });
  app.get("/llms.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/llm.txt", (_req, res) => {
    res.redirect(302, "/docs/llms.txt");
  });
  app.get("/docs/llms-full.txt", (_req, res) => {
    sendDocFile(res, docsRoot, "llms-full.txt", "text/plain");
  });
  app.get("/llms-full.txt", (_req, res) => {
    res.redirect(302, "/docs/llms-full.txt");
  });
  if (config.includeWellKnown) {
    app.get("/.well-known/openapi.json", (_req, res) => {
      res.redirect(302, "/docs/openapi.json");
    });
    if (config.wellKnownRoutes) {
      for (const [route, handler] of Object.entries(config.wellKnownRoutes)) {
        app.get(`/.well-known/${route}`, handler);
      }
    }
  }
}

export {
  registerDocRoutes
};
