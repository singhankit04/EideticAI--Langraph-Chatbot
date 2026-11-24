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

// Returns safe error message: real details in dev, generic fallback in production
export function safeError(err, fallback = "Internal Server Error") {
  return isProduction ? fallback : err?.message || fallback;
}

// Extract unified chatId from request
export function extractChatId(req) {
  const candidate =
    req.params?.chatId ||
    req.body?.chatId ||
    req.query?.chatId;

  return candidate && String(candidate).trim()
    ? String(candidate).trim()
    : randomUUID();
}

/**
 * Upload & process PDF.
 *
 * Supports two modes:
 * 1. Synchronous (default when wait=true or when awaiting job completion):
 *    Waits for BullMQ worker to finish via job.waitUntilFinished() with a safe timeout.
 * 2. Asynchronous (when wait=false / background mode):
 *    Immediately returns HTTP 202 with jobId for tracking via /api/jobs/:jobId.
 */
export async function uploadPdfHandler(req, res) {
  let uploadedFilePath = null;
  let isEnqueued = false;

  try {
    const chatId = extractChatId(req);

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
        customMetadata =
          typeof req.body.metadata === "string"
            ? JSON.parse(req.body.metadata)
            : req.body.metadata;
      } catch (parseErr) {
        console.warn(`[PDF Controller] Could not parse custom metadata: ${parseErr.message}`);
      }
    }

    // Enqueue job into BullMQ message queue for processing
    const job = await addPdfProcessingJob({
      filePath: req.file.path,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      chatId,
      customMetadata,
    });

    isEnqueued = true;
    console.log(`[PDF Controller] Enqueued job ${job.id} for "${req.file.originalname}" (chatId: ${chatId})`);

    // Check if synchronous wait is requested or enabled
    // If ?async=true, return 202 immediately. Otherwise await completion with safe timeout (120s default).
    const isAsyncMode = req.query?.async === "true" || req.query?.background === "true";

    if (isAsyncMode) {
      return res.status(202).json({
        message: `Upload accepted. Processing "${req.file.originalname}" in the background.`,
        status: "queued",
        jobId: job.id,
        chatId,
        source: req.file.originalname,
        fileSize: req.file.size,
        statusUrl: `/api/jobs/${job.id}`,
      });
    }

    // Synchronous wait with a defined timeout (prevents hanging forever)
    const timeoutMs = Number(req.query?.timeout) || 120000;
    const result = await job.waitUntilFinished(getQueueEvents(), timeoutMs);

    return res.status(200).json({
      message: `Successfully indexed "${req.file.originalname}"!`,
      status: "completed",
      chatId,
      source: req.file.originalname,
      pagesCount: result?.pagesCount || 1,
      chunksCount: result?.chunksCount || 0,
      durationMs: result?.durationMs,
      jobId: job.id,
    });
  } catch (err) {
    console.error("[PDF Controller] Upload handler error:", err);

    // ONLY unlink the file if the job was NOT enqueued to the queue.
    // Once enqueued, the background worker owns the file lifecycle to prevent "File not found" race conditions.
    if (!isEnqueued && uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      await fs.promises.unlink(uploadedFilePath).catch(() => {});
    }

    return res.status(500).json({
      error: safeError(err, "Failed to process and index PDF."),
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
  extractChatId,
  safeError,
};
