import fs from "node:fs";
import { Worker, UnrecoverableError } from "bullmq";
import { PDFParse } from "pdf-parse";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { QdrantVectorStore } from "@langchain/qdrant";
import { redis } from "../config/connections.js";
import { embeddingsModel } from "../llm_models/embeddings.js";
import { moveToDlq } from "./dlq.js";

let workerInstance = null;

// Extracts text from PDF, splits into chunks, and uploads embeddings to Qdrant
export async function processPdfJob(job) {
  const startTime = Date.now();
  const { filePath, originalName, conversationId, chatId, threadId } = job.data;
  const id = conversationId || chatId || threadId;

  console.log(`[Job ${job.id}] Processing "${originalName}" (${id})`);
  await job.updateProgress(5);

  if (!filePath || !fs.existsSync(filePath)) {
    throw new UnrecoverableError(`File not found on disk: "${filePath}".`);
  }

  // 1. Read file buffer
  const fileBuffer = await fs.promises.readFile(filePath);
  await job.updateProgress(20);

  // 2. Extract text from PDF
  let validPages = [];
  try {
    const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
    const parsed = await parser.getText();
    await parser.destroy();
    validPages = (parsed.pages || []).filter((p) => p.text?.trim().length > 0);
  } catch (err) {
    throw new UnrecoverableError(
      `Corrupt or unreadable PDF "${originalName}": ${err.message}`,
    );
  }

  if (validPages.length === 0) {
    throw new UnrecoverableError(
      `PDF "${originalName}" has 0 readable text pages.`,
    );
  }

  await job.updateProgress(45);

  // 3. Split into semantic chunks
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const docs = await splitter.createDocuments(
    validPages.map((p) => p.text),
    validPages.map((p) => ({
      source: originalName,
      page: p.num,
      conversationId: id,
      chatId: id,
      threadId: id,
      jobId: String(job.id),
      indexedAt: new Date().toISOString(),
    })),
  );

  await job.updateProgress(70);

  // 4. Upsert vectors to Qdrant
  await QdrantVectorStore.fromDocuments(docs, embeddingsModel, {
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
    collectionName: process.env.QDRANT_COLLECTION || "rag_documents",
  });

  await job.updateProgress(95);

  // 5. Cleanup temp file upon success
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath).catch(() => {});
  }

  await job.updateProgress(100);
  const durationMs = Date.now() - startTime;
  console.log(
    `[Job ${job.id}] Completed in ${durationMs}ms — Indexed ${docs.length} chunks across ${validPages.length} pages.`,
  );

  return {
    success: true,
    jobId: job.id,
    originalName,
    conversationId: id,
    pagesCount: validPages.length,
    chunksCount: docs.length,
    durationMs,
    processedAt: new Date().toISOString(),
  };
}

// Start BullMQ background worker for PDF processing
export function startPdfWorker() {
  if (workerInstance) return workerInstance;

  workerInstance = new Worker("pdf-processing-queue", processPdfJob, {
    connection: redis.duplicate(),
    concurrency: 2,
  });

  workerInstance.on("ready", () =>
    console.log("[Worker] PDF Processing Worker ready (concurrency: 2)"),
  );
  workerInstance.on("active", (job) =>
    console.log(
      `[Worker] Job ${job.id} active (attempt ${job.attemptsMade + 1}/${job.opts.attempts || 3})`,
    ),
  );
  workerInstance.on("progress", (job, progress) =>
    console.log(`[Worker] Job ${job.id} progress: ${progress}%`),
  );
  workerInstance.on("completed", (job, result) =>
    console.log(
      `[Worker] Job ${job.id} completed (chunks: ${result?.chunksCount}, pages: ${result?.pagesCount})`,
    ),
  );

  workerInstance.on("failed", async (job, err) => {
    if (!job) return;

    const maxAttempts = job.opts?.attempts || 3;
    const isExhausted = job.attemptsMade >= maxAttempts;
    const isUnrecoverable =
      err?.name === "UnrecoverableError" ||
      err?.name === "BullUnrecoverableError" ||
      err?.isUnrecoverable === true;

    if (isExhausted || isUnrecoverable) {
      console.error(
        `[Worker] Job ${job.id} failed permanently (${job.attemptsMade}/${maxAttempts}): ${err.message}. Moving to DLQ...`,
      );
      try {
        await moveToDlq(job, err);
      } catch (dlqErr) {
        console.error(
          `[Worker] Failed to route job ${job.id} to DLQ: ${dlqErr.message}`,
        );
      }
    } else {
      console.warn(
        `[Worker] Job ${job.id} failed attempt ${job.attemptsMade}/${maxAttempts}: ${err.message}. Retrying with backoff...`,
      );
    }
  });

  workerInstance.on("error", (err) =>
    console.error(`[Worker Error] ${err.message}`),
  );
  return workerInstance;
}

export function getPdfWorker() {
  return workerInstance;
}

// Graceful shutdown
export async function stopPdfWorker() {
  if (workerInstance) {
    console.log("[Worker] Closing PDF Queue worker...");
    await workerInstance.close();
    workerInstance = null;
    console.log("[Worker] PDF Queue worker stopped.");
  }
}

export default {
  startPdfWorker,
  stopPdfWorker,
  getPdfWorker,
  processPdfJob,
};
