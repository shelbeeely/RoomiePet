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
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const server = app.listen(port, host, () => {
  console.log(`RoomiePet on http://localhost:${port}` + (fs.existsSync(dist) ? "" : " (API only; run the client with npm run dev)"));
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    app.locals.hub.closeAll();
    server.close(() => process.exit(0));
  });
}
