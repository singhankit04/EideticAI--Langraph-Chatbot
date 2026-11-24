import fs from "node:fs";
import { pdfDlqQueue, pdfQueue, PDF_QUEUE_NAME } from "./queue.js";

// Classify error type for easier debugging
export function categorizeError(error) {
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("empty") || msg.includes("no text") || msg.includes("failed to extract text")) return "EMPTY_DOCUMENT";
  if (msg.includes("pdf") || msg.includes("corrupt") || msg.includes("invalid") || msg.includes("syntax")) return "CORRUPT_OR_INVALID_PDF";
  if (msg.includes("qdrant") || msg.includes("vector") || msg.includes("collection")) return "VECTOR_STORE_ERROR";
  if (msg.includes("gemini") || msg.includes("embedding") || msg.includes("quota") || msg.includes("429")) return "EMBEDDING_API_ERROR";
  if (msg.includes("enoent") || msg.includes("not found")) return "FILE_NOT_FOUND";
  return "SYSTEM_ERROR";
}

// Move permanently failed job into the DLQ
export async function moveToDlq(job, error) {
  const errorCategory = categorizeError(error);
  const chatId = job.data?.chatId;

  const dlqJob = await pdfDlqQueue.add(
    "dead-letter-job",
    {
      originalJobId: job.id,
      originalQueue: job.queueName || PDF_QUEUE_NAME,
      originalName: job.data.originalName,
      filePath: job.data.filePath,
      fileSize: job.data.fileSize,
      chatId,
      failedReason: error.message || "Unknown processing failure",
      stackTrace: error.stack || null,
      errorCategory,
      attemptsMade: job.attemptsMade || 0,
      failedAt: new Date().toISOString(),
      originalPayload: job.data,
    },
    { jobId: `dlq-${job.id}-${Date.now()}` }
  );

  console.error(`[DLQ] Job ${job.id} moved to DLQ (Category: ${errorCategory}, File: ${job.data.originalName}, Chat: ${chatId})`);
  return dlqJob;
}

// Get paginated list of DLQ jobs
export async function getDlqJobs(start = 0, end = 50) {
  const jobs = await pdfDlqQueue.getJobs(["waiting", "delayed", "active", "completed", "failed"], start, end, true);
  return jobs.map((j) => ({
    dlqJobId: j.id,
    name: j.name,
    timestamp: j.timestamp,
    ...j.data,
  }));
}

// Get a single DLQ job by ID
export async function getDlqJob(dlqJobId) {
  const job = await pdfDlqQueue.getJob(dlqJobId);
  return job ? { dlqJobId: job.id, timestamp: job.timestamp, ...job.data } : null;
}

// Re-queue a failed job from DLQ back to active queue
export async function retryDlqJob(dlqJobId) {
  const dlqJob = await pdfDlqQueue.getJob(dlqJobId);
  if (!dlqJob) throw new Error(`DLQ Job with ID "${dlqJobId}" not found.`);

  const { filePath, originalName, fileSize, chatId, originalPayload } = dlqJob.data;
  const targetChatId = chatId;

  if (filePath && !fs.existsSync(filePath)) {
    throw new Error(`Cannot retry job: File "${filePath}" no longer exists on disk.`);
  }

  const newJob = await pdfQueue.add(
    "process-pdf",
    {
      filePath,
      originalName,
      fileSize,
      chatId: targetChatId,
      customMetadata: originalPayload?.customMetadata || {},
      retriedFromDlqAt: new Date().toISOString(),
      previousDlqId: dlqJobId,
    },
    { attempts: 3 }
  );

  await dlqJob.remove();
  console.log(`[DLQ] Retried "${dlqJobId}" -> Created active job "${newJob.id}" (chatId: ${targetChatId})`);
  return { success: true, newJobId: newJob.id, dlqJobId, message: `Job re-queued successfully as "${newJob.id}".` };
}

// Remove single DLQ job and its file
export async function removeDlqJob(dlqJobId, deleteFile = true) {
  const job = await pdfDlqQueue.getJob(dlqJobId);
  if (!job) throw new Error(`DLQ Job with ID "${dlqJobId}" not found.`);

  const filePath = job.data?.filePath;
  await job.remove();

  if (deleteFile && filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn(`[DLQ] Could not delete disk file "${filePath}": ${err.message}`);
    }
  }

  return { success: true, dlqJobId, message: `DLQ job "${dlqJobId}" deleted.` };
}

// Purge all DLQ jobs
export async function clearDlq() {
  const jobs = await pdfDlqQueue.getJobs(["waiting", "delayed", "active", "completed", "failed"]);
  for (const job of jobs) await job.remove();
  console.log(`[DLQ] Purged all ${jobs.length} DLQ records.`);
  return { message: `Purged all ${jobs.length} records from DLQ.`, count: jobs.length };
}

// Get DLQ job counts
export async function getDlqStats() {
  const counts = await pdfDlqQueue.getJobCounts("waiting", "delayed", "active", "completed", "failed");
  return { ...counts, total: Object.values(counts).reduce((acc, c) => acc + c, 0) };
}

export default {
  moveToDlq,
  getDlqJobs,
  getDlqJob,
  retryDlqJob,
  removeDlqJob,
  clearDlq,
  getDlqStats,
  categorizeError,
};
