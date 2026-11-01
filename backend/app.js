import express from "express";
import cors from "cors";
import helmet from "helmet";
import { upload } from "./utils/multer.js";
import {
  chatRateLimiter,
  pdfUploadRateLimiter,
} from "./middlewares/ratelimit.js";
import {
  chatHandler,
  uploadPdfHandler,
  getConversationHistoryHandler,
  clearConversationHandler,
  getJobStatusHandler,
  getDlqJobsHandler,
  getDlqJobDetailsHandler,
  retryDlqJobHandler,
  removeDlqJobHandler,
  clearDlqHandler,
} from "./controllers/chatController.js";

const app = express();

// Trust reverse proxy (Render / Docker) for accurate client IP detection
app.set("trust proxy", 1);

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin.trim().replace(/\/+$/, ""))
      ) {
        return callback(null, true);
      }
      return callback(
        new Error(`CORS violation: Origin "${origin}" not allowed.`),
      );
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Health & Status Routes
app.get("/", (req, res) => {
  res.json({ server: process.env.PORT, status: "ok", app: "eideticai" });
});
app.get("/api/health", (req, res) =>
  res.json({ app: "eideticai", status: "healthy", uptime: process.uptime() }),
);

// Chat & Conversation Routes (Rate limit: 60 questions per 60 mins per IP)
app.post("/api/chat/:conversationId", chatRateLimiter, chatHandler);
app.get("/api/chat/:conversationId/history", getConversationHistoryHandler);
app.delete("/api/chat/:conversationId", clearConversationHandler);

// PDF Ingestion Routes (Rate limit: 5 uploads per 24 hours per IP)
app.post(
  "/api/chat/:conversationId/upload",
  pdfUploadRateLimiter,
  upload.single("pdf"),
  uploadPdfHandler,
);

// DLQ Admin Authentication Middleware
app.use("/api/jobs/dlq", (req, res, next) => {
  const expectedAdmin = process.env.ADMIN;
  const expectedPassword = process.env.PASSWORD;

  if (!expectedAdmin || !expectedPassword) {
    return res
      .status(500)
      .json({ error: "Admin credentials are not configured on the server." });
  }

  const admin = req.body?.admin || req.headers?.["admin"] || req.query?.admin;
  const password =
    req.body?.password || req.headers?.["password"] || req.query?.password;

  if (!admin || !password) {
    return res.status(401).json({
      error:
        "Authentication required. Provide 'admin' and 'password' in request body or headers.",
    });
  }

  if (admin !== expectedAdmin || password !== expectedPassword) {
    return res
      .status(403)
      .json({ error: "Access denied: Invalid admin username or password." });
  }

  next();
});

// Background Job & DLQ Routes
app.get("/api/jobs/dlq", getDlqJobsHandler);
app.delete("/api/jobs/dlq", clearDlqHandler);
app.get("/api/jobs/dlq/:jobId", getDlqJobDetailsHandler);
app.post("/api/jobs/dlq/:jobId/retry", retryDlqJobHandler);
app.delete("/api/jobs/dlq/:jobId", removeDlqJobHandler);
app.get("/api/jobs/:jobId", getJobStatusHandler);

// 404 & Error Handlers
app.use((req, res) =>
  res
    .status(404)
    .json({ error: `Not found: ${req.method} ${req.originalUrl}` }),
);
app.use((err, req, res, next) => {
  console.error("API Error:", err);
  const isProduction = process.env.NODE_ENV === "production";
  res
    .status(err.status || 500)
    .json({ error: isProduction ? "Internal Server Error" : err.message || "Internal Server Error" });
});

export default app;
