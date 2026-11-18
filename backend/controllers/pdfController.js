import fs from "node:fs";
import { randomUUID } from "node:crypto";
import {
  pdfQueue,
  addPdfProcessingJob,
  getJobStatus,
  getQueueEvents,
} from "../background_jobs/queue.js";
import {
  getDlqJobs,
  getDlqJob,
  retryDlqJob,
  removeDlqJob,
  clearDlq,
  getDlqStats,
} from "../background_jobs/dlq.js";

const isProduction = process.env.NODE_ENV === "production";

// Returns a safe error message: real details in dev, generic fallback in production
export function safeError(err, fallback = "Internal Server Error") {
  return isProduction ? fallback : err?.message || fallback;
}

// Extract conversationId / threadId from request
export function extractConversationId(req) {
  const candidate =
    req.params?.conversationId ||
    req.params?.chatId ||
    req.body?.conversationId ||
    req.body?.conversation_id ||
    req.body?.threadId ||
    req.body?.chatId ||
    req.headers?.["x-conversation-id"] ||
    req.headers?.["x-chat-id"] ||
    req.query?.conversationId ||
    req.query?.chatId;

  return candidate && String(candidate).trim()
    ? String(candidate).trim()
    : randomUUID();
}

/**
 * Upload & enqueue PDF for asynchronous processing via message queue (BullMQ).
 * 
 * Flow:
 * 1. Validates presence and non-empty size of uploaded PDF file.
 * 2. Extracts conversationId / threadId.
 * 3. Enqueues job to BullMQ `pdf-processing-queue`.
 * 4. Responds immediately with HTTP 202 (Accepted) and jobId for background tracking.
 *    (Or if ?wait=true / ?sync=true is specified, waits synchronously for job completion).
 */
export async function uploadPdfHandler(req, res) {
  let uploadedFilePath = null;

  try {
    const conversationId = extractConversationId(req);

    if (!req.file) {
      return res.status(400).json({
        error: "No PDF file uploaded. Use the form-data key 'pdf'.",
      });
    }

    uploadedFilePath = req.file.path;

    if (req.file.size === 0) {
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        await fs.promises.unlink(uploadedFilePath).catch(() => {});
      }
      return res.status(400).json({
        error: "Uploaded PDF file is empty (0 bytes).",
      });
    }

    // Optional custom metadata passed along with the upload
    let customMetadata = {};
    if (req.body?.metadata) {
      try {
        customMetadata = typeof req.body.metadata === "string"
          ? JSON.parse(req.body.metadata)
          : req.body.metadata;
      } catch (parseErr) {
        console.warn(`[PDF Controller] Could not parse custom metadata: ${parseErr.message}`);
      }
    }

    // Enqueue job into BullMQ message queue for async processing
    const job = await addPdfProcessingJob({
      filePath: req.file.path,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      conversationId,
      customMetadata,
    });

    console.log(`[PDF Controller] Enqueued job ${job.id} for "${req.file.originalname}" (${conversationId})`);

    // Synchronous wait if ?wait=true or ?sync=true
    if (req.query?.wait === "true" || req.query?.sync === "true") {
      const timeoutMs = Number(req.query.timeout) || 120000;
      const result = await job.waitUntilFinished(getQueueEvents(), timeoutMs);

      return res.status(200).json({
        message: `Successfully indexed "${req.file.originalname}" for conversation!`,
        status: "completed",
        conversationId,
        chatId: conversationId,
        threadId: conversationId,
        source: req.file.originalname,
        pagesCount: result?.pagesCount || 1,
        chunksCount: result?.chunksCount || 0,
        durationMs: result?.durationMs,
        jobId: job.id,
      });
    }

    // Asynchronous processing response (202 Accepted)
    return res.status(202).json({
      message: `Upload accepted. Processing "${req.file.originalname}" in the background.`,
      status: "queued",
      jobId: job.id,
      conversationId,
      chatId: conversationId,
      threadId: conversationId,
      source: req.file.originalname,
      fileSize: req.file.size,
      pagesCount: 1,
      statusUrl: `/api/jobs/${job.id}`,
    });
  } catch (err) {
    console.error("[PDF Controller] Upload handler error:", err);

    // Clean up uploaded file if enqueueing failed
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      await fs.promises.unlink(uploadedFilePath).catch(() => {});
    }

    return res.status(500).json({
      error: safeError(err, "Failed to process and enqueue PDF."),
    });
  }
}

/**
 * Job status endpoint to track background queue processing progress
 */
export async function getJobStatusHandler(req, res) {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res.status(400).json({ error: "Job ID is required." });
    }

    const status = await getJobStatus(jobId);
    if (!status) {
      return res.status(404).json({ error: `Job "${jobId}" not found.` });
    }

    return res.status(200).json(status);
  } catch (err) {
    console.error(`[PDF Controller] Get job status error for ${req.params?.jobId}:`, err);
    return res.status(500).json({ error: safeError(err, "Failed to retrieve job status.") });
  }
}

/**
 * Queue statistics endpoint (waiting, active, completed, failed, delayed counts)
 */
export async function getQueueStatsHandler(req, res) {
  try {
    const counts = await pdfQueue.getJobCounts(
      "waiting",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused"
    );

    return res.status(200).json({
      queue: "pdf-processing-queue",
      counts,
      total: Object.values(counts).reduce((acc, c) => acc + c, 0),
    });
  } catch (err) {
    console.error("[PDF Controller] Get queue stats error:", err);
    return res.status(500).json({ error: safeError(err, "Failed to retrieve queue stats.") });
  }
}

/**
 * DLQ (Dead Letter Queue) management endpoints
 */
export async function getDlqJobsHandler(req, res) {
  try {
    const [stats, jobs] = await Promise.all([getDlqStats(), getDlqJobs()]);
    return res.status(200).json({ stats, jobs });
  } catch (err) {
    console.error("[PDF Controller] Get DLQ jobs error:", err);
    return res.status(500).json({ error: safeError(err, "Failed to retrieve DLQ jobs.") });
  }
}

export async function getDlqJobDetailsHandler(req, res) {
  try {
    const { jobId } = req.params;
    const job = await getDlqJob(jobId);
    if (!job) {
      return res.status(404).json({ error: `DLQ record "${jobId}" not found.` });
    }
    return res.status(200).json(job);
  } catch (err) {
    console.error(`[PDF Controller] Get DLQ job details error for ${req.params?.jobId}:`, err);
    return res.status(500).json({ error: safeError(err, "Failed to retrieve DLQ record.") });
  }
}

export async function retryDlqJobHandler(req, res) {
  try {
    const { jobId } = req.params;
    const result = await retryDlqJob(jobId);
    return res.status(200).json(result);
  } catch (err) {
    console.error(`[PDF Controller] Retry DLQ job error for ${req.params?.jobId}:`, err);
    return res.status(500).json({ error: safeError(err, "Failed to retry DLQ job.") });
  }
}

export async function removeDlqJobHandler(req, res) {
  try {
    const { jobId } = req.params;
    const result = await removeDlqJob(jobId);
    return res.status(200).json(result);
  } catch (err) {
    console.error(`[PDF Controller] Remove DLQ job error for ${req.params?.jobId}:`, err);
    return res.status(500).json({ error: safeError(err, "Failed to remove DLQ job.") });
  }
}

export async function clearDlqHandler(req, res) {
  try {
    const result = await clearDlq();
    return res.status(200).json(result);
  } catch (err) {
    console.error("[PDF Controller] Clear DLQ error:", err);
    return res.status(500).json({ error: safeError(err, "Failed to clear DLQ.") });
  }
}

export default {
  uploadPdfHandler,
  getJobStatusHandler,
  getQueueStatsHandler,
  getDlqJobsHandler,
  getDlqJobDetailsHandler,
  retryDlqJobHandler,
  removeDlqJobHandler,
  clearDlqHandler,
  extractConversationId,
  safeError,
};

