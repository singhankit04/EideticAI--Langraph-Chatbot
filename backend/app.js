import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { upload } from "./utils/multer.js";
import { requireAuth, optionalAuth } from "./middlewares/auth.js";
import {
  chatRateLimiter,
  pdfUploadRateLimiter,
  authRateLimiter,
} from "./middlewares/ratelimit.js";
import {
  signupHandler,
  signinHandler,
  getMeHandler,
  googleAuthRedirectHandler,
  googleAuthCallbackHandler,
} from "./controllers/authController.js";
import {
  getUserChatsHandler,
  createChatHandler,
  getChatMessagesHandler,
  updateChatHandler,
  deleteChatHandler,
  chatHandler,
  getConversationHistoryHandler,
  clearConversationHandler,
} from "./controllers/chatController.js";
import {
  uploadPdfHandler,
  getJobStatusHandler,
  getQueueStatsHandler,
  getDlqJobsHandler,
  getDlqJobDetailsHandler,
  retryDlqJobHandler,
  removeDlqJobHandler,
  clearDlqHandler,
} from "./controllers/pdfController.js";

const app = express();

// Trust reverse proxy (e.g. Render, Docker, Nginx) for accurate client IP detection
app.set("trust proxy", 1);

// Allowed CORS origins configuration
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3000,http://localhost:3001")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin.trim().replace(/\/+$/, ""))) {
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


// ==========================================
// 1. System & Health Endpoints
// ==========================================

app.get("/", (req, res) => {
  res.json({ status: "ok", app: "eideticai" });
});

app.get("/api/health", (req, res) => {
  res.json({ app: "eideticai", status: "healthy", uptime: Math.round(process.uptime()) });
});


// ==========================================
// 2. Authentication & OAuth Endpoints
// ==========================================

// Register a new local user account (Email + Password)
app.post("/api/auth/signup", authRateLimiter, signupHandler);

// Authenticate user credentials and receive JWT
app.post("/api/auth/signin", authRateLimiter, signinHandler);

// Fetch current authenticated user's profile
app.get("/api/auth/me", requireAuth, getMeHandler);

// Google OAuth 2.0: Redirect browser to Google's consent screen
app.get("/api/auth/google", googleAuthRedirectHandler);

// Google OAuth 2.0: Exchange authorization code, upsert user, issue JWT
app.get("/api/auth/google/callback", googleAuthCallbackHandler);


// ==========================================
// 3. User Chat Session Management Endpoints
// ==========================================

// List all chat conversations for authenticated user (Sidebar)
app.get("/api/chats", requireAuth, getUserChatsHandler);

// Create a new chat conversation session
app.post("/api/chats", requireAuth, createChatHandler);

// Retrieve all messages for a specific chat conversation
app.get("/api/chats/:chatId", requireAuth, getChatMessagesHandler);

// Update chat conversation title or pinned status
app.patch("/api/chats/:chatId", requireAuth, updateChatHandler);

// Delete chat conversation, all its messages, and checkpointer state
app.delete("/api/chats/:chatId", requireAuth, deleteChatHandler);


// ==========================================
// 4. Live Chat & Document Ingestion Endpoints
// ==========================================

// Stream assistant response for a message via Server-Sent Events (SSE)
app.post("/api/chat/:chatId", optionalAuth, chatRateLimiter, chatHandler);

// Upload and ingest PDF document into vector store for a chat session
app.post(
  "/api/chat/:chatId/upload",
  optionalAuth,
  pdfUploadRateLimiter,
  upload.single("pdf"),
  uploadPdfHandler,
);

// Get conversation message history (supports authenticated users & guests)
app.get("/api/chat/:chatId/history", optionalAuth, getConversationHistoryHandler);

// Clear message history & memory checkpoint for a chat session
app.delete("/api/chat/:chatId/history", optionalAuth, clearConversationHandler);


// ==========================================
// 5. Background Jobs & DLQ Endpoints
// ==========================================

// DLQ Admin Authentication Guard
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
      error: "Authentication required. Provide 'admin' and 'password' in request body or headers.",
    });
  }

  if (admin !== expectedAdmin || password !== expectedPassword) {
    return res
      .status(403)
      .json({ error: "Access denied: Invalid admin username or password." });
  }

  next();
});

// Queue processing statistics
app.get("/api/jobs/stats", getQueueStatsHandler);

// DLQ jobs listing & administration
app.get("/api/jobs/dlq", getDlqJobsHandler);
app.delete("/api/jobs/dlq", clearDlqHandler);
app.get("/api/jobs/dlq/:jobId", getDlqJobDetailsHandler);
app.post("/api/jobs/dlq/:jobId/retry", retryDlqJobHandler);
app.delete("/api/jobs/dlq/:jobId", removeDlqJobHandler);

// Background PDF processing job status
app.get("/api/jobs/:jobId", getJobStatusHandler);


// ==========================================
// 6. 404 & Global Error Handling
// ==========================================

app.use((req, res) =>
  res
    .status(404)
    .json({ error: `Not found: ${req.method} ${req.originalUrl}` }),
);

app.use((err, req, res, next) => {
  console.error("API Error:", err);
  const isProduction = process.env.NODE_ENV === "production";
  res.status(err.status || 500).json({
    error: isProduction ? "Internal Server Error" : err.message || "Internal Server Error",
  });
});

export default app;
