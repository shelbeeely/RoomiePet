// Starts RoomiePet: the API, and the built app (client/dist) if it is there.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const dbPath = process.env.DB_PATH || path.join(here, "..", "..", "data", "roomiepet.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const app = createApp(openDb(dbPath));
// Behind a proxy (most hosts), the client's address is in X-Forwarded-For.
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY);

const dist = path.join(here, "..", "..", "client", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist, {
    index: false,
    maxAge: "1h",
    setHeaders(res, file) {
      const name = path.basename(file);
      // The service worker and manifest must always be the latest, or phones keep an old app.
      if (name === "sw.js" || name === "manifest.webmanifest") res.set("Cache-Control", "no-cache");
      if (name === "manifest.webmanifest") res.type("application/manifest+json");
      // Built files have content hashes in their names: they never change.
      if (file.includes(`${path.sep}assets${path.sep}`)) res.set("Cache-Control", "public, max-age=31536000, immutable");
    },
  }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const server = app.listen(port, host, () => {
  console.log(`RoomiePet on http://localhost:${port}` + (fs.existsSync(dist) ? "" : " (API only; run the client with npm run dev)"));
});

// Morning lists and pet alerts: checked every minute, sent at most once each.
const ticking = setInterval(() => app.locals.tick().catch((e) => console.error("notifications:", e)), 60 * 1000);

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    clearInterval(ticking);
    app.locals.hub.closeAll();
    server.close(() => process.exit(0));
  });
}
