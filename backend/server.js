import app from "./app.js";
import { checkConnections } from "./config/connections.js";
import { startPdfWorker, stopPdfWorker } from "./background_jobs/worker.js";
import { startKeepAliveCron, stopKeepAliveCron } from "./cronjob/keepAlive.js";
import "dotenv/config";

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT,"0.0.0.0", async () => {
  console.log(`[Server] Listening on http://localhost:${PORT}`);
  await checkConnections();
  startPdfWorker();
  startKeepAliveCron();
});

async function shutdown() {
  console.log("Shutting down gracefully...");
  stopKeepAliveCron();
  await stopPdfWorker();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
