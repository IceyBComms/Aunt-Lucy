// Imported first so the env diagnostic is logged before @workspace/db (imported
// transitively via ./app) can throw on a missing DATABASE_URL.
import "./lib/startupDiagnostics";
import app from "./app";
import { logger } from "./lib/logger";

// Railway and most hosts inject PORT; fall back to 3001 for local development.
const port = Number(process.env.PORT || 3001);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

// Bind to 0.0.0.0 so the platform's router can reach the container. Node's
// default binding can leave the app unreachable behind a proxy, which surfaces
// as "Application failed to respond".
const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
