import { randomUUID } from "node:crypto";
import { HumanMessage } from "@langchain/core/messages";
import { chatbotApp, checkpointer } from "../chatbot/graph.js";
import { addPdfProcessingJob, getJobStatus, getQueueEvents } from "../background_jobs/queue.js";
import { getDlqJobs, getDlqJob, retryDlqJob, removeDlqJob, clearDlq, getDlqStats } from "../background_jobs/dlq.js";

const isProduction = process.env.NODE_ENV === "production";

// Returns a safe error message: real details in dev, generic fallback in production
function safeError(err, fallback = "Internal Server Error") {
  return isProduction ? fallback : (err.message || fallback);
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

  return candidate && String(candidate).trim() ? String(candidate).trim() : randomUUID();
}

// Upload & enqueue PDF for background processing
export async function uploadPdfHandler(req, res) {
  try {
    const conversationId = extractConversationId(req);
    if (!req.file) {
      return res.status(400).json({ error: "No PDF file uploaded. Use the form-data key 'pdf'." });
    }

    const job = await addPdfProcessingJob({
      filePath: req.file.path,
      originalName: req.file.originalname,
      fileSize: req.file.size,
      conversationId,
    });

    // Synchronous wait if ?wait=true
    if (req.query.wait === "true" || req.query.sync === "true") {
      const result = await job.waitUntilFinished(getQueueEvents(), 120000);
      return res.json({
        message: `Successfully indexed "${req.file.originalname}" for conversation!`,
        conversationId,
        chatId: conversationId,
        threadId: conversationId,
        source: req.file.originalname,
        pagesCount: result?.pagesCount || 1,
        chunksCount: result?.chunksCount || 0,
        jobId: job.id,
      });
    }

    // 202 Accepted background queue response
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
    });
  } catch (err) {
    console.error("Upload handler error:", err);
    return res.status(500).json({ error: safeError(err, "Failed to process PDF.") });
  }
}

// Job status endpoint
export async function getJobStatusHandler(req, res) {
  try {
    const status = await getJobStatus(req.params.jobId);
    if (!status) return res.status(404).json({ error: `Job "${req.params.jobId}" not found.` });
    return res.json(status);
  } catch (err) {
    return res.status(500).json({ error: safeError(err) });
  }
}

// DLQ management endpoints
export async function getDlqJobsHandler(req, res) {
  try {
    const [stats, jobs] = await Promise.all([getDlqStats(), getDlqJobs()]);
    return res.json({ stats, jobs });
  } catch (err) {
    return res.status(500).json({ error: safeError(err) });
  }
}

export async function getDlqJobDetailsHandler(req, res) {
  try {
    const job = await getDlqJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: `DLQ record "${req.params.jobId}" not found.` });
    return res.json(job);
  } catch (err) {
    return res.status(500).json({ error: safeError(err) });
  }
}

export async function retryDlqJobHandler(req, res) {
  try {
    const result = await retryDlqJob(req.params.jobId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: safeError(err) });
  }
}

export async function removeDlqJobHandler(req, res) {
  try {
    const result = await removeDlqJob(req.params.jobId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: safeError(err) });
  }
}

export async function clearDlqHandler(req, res) {
  try {
    const result = await clearDlq();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: safeError(err) });
  }
}

// Sanitize tables and excessive asterisks in LLM response
export function cleanStructuredOutput(text) {
  if (!text || typeof text !== "string") return text || "";

  const lines = text.split("\n");
  const cleaned = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip table delimiter row |---|---|
    if (/^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed)) {
      inTable = true;
      continue;
    }

    // Clean headings wrapped in **
    if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
      cleaned.push(trimmed.slice(2, -2).trim());
      continue;
    }

    // Convert pipe tables to clean bullet points
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim().replace(/^\*\*|\*\*$/g, "").trim())
        .filter(Boolean);

      if (cells.length === 0) continue;

      const lowerFirst = cells[0].toLowerCase();
      if (!inTable && ["section", "topic", "field", "category", "item"].includes(lowerFirst)) {
        inTable = true;
        continue;
      }

      inTable = true;
      cleaned.push(cells.length >= 2 ? `• ${cells[0]}: ${cells.slice(1).join(" — ")}` : `• ${cells[0]}`);
      continue;
    } else {
      inTable = false;
    }

    cleaned.push(
      rawLine.includes("|") ? rawLine.replace(/\s*\|\s*/g, " — ").replace(/\*{3,}/g, "**") : rawLine.replace(/\*{3,}/g, "**")
    );
  }

  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Handle chat messages with LangGraph agent
export async function chatHandler(req, res) {
  try {
    const conversationId = extractConversationId(req);
    const rawQuestion =
      req.body?.message ||
      req.body?.question ||
      (Array.isArray(req.body?.messages) ? req.body.messages[req.body.messages.length - 1]?.content : undefined);

    if (!rawQuestion || !String(rawQuestion).trim()) {
      return res.status(400).json({ error: "A valid 'message' or 'question' field is required." });
    }

    const question = String(rawQuestion).trim();

    const response = await chatbotApp.invoke(
      { messages: [new HumanMessage(question)] },
      { configurable: { thread_id: conversationId } }
    );

    const messages = response.messages || [];
    const lastMessage = messages[messages.length - 1];
    const answer = cleanStructuredOutput(lastMessage?.content || "No response generated.");

    // Extract citations from the current turn
    const sources = [];
    const seen = new Set();
    let currentTurnStartIndex = -1;

    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m._getType?.() === "human" || m.constructor?.name === "HumanMessage" || m.role === "human" || m.type === "human") {
        currentTurnStartIndex = i;
        break;
      }
    }

    const currentTurnMessages = currentTurnStartIndex !== -1 ? messages.slice(currentTurnStartIndex + 1) : [lastMessage];

    for (const msg of currentTurnMessages) {
      if (msg.name === "search_uploaded_documents" && Array.isArray(msg.artifact)) {
        for (const item of msg.artifact) {
          const key = `${item.source}:${item.page}`;
          if (!seen.has(key)) {
            seen.add(key);
            sources.push(item);
          }
        }
      }
    }

    return res.json({ answer, sources, conversationId, chatId: conversationId, threadId: conversationId });
  } catch (err) {
    console.error("Chat handler error:", err);
    return res.status(500).json({ error: safeError(err, "Failed to process chat message.") });
  }
}

// Retrieve message history from MemorySaver
export async function getConversationHistoryHandler(req, res) {
  try {
    const conversationId = extractConversationId(req);
    const state = await chatbotApp.getState({ configurable: { thread_id: conversationId } });

    const messages = (state?.values?.messages || []).map((msg) => ({
      role: msg._getType?.() || (msg.constructor?.name === "HumanMessage" ? "human" : "ai"),
      content: msg.content,
      name: msg.name,
      id: msg.id,
    }));

    return res.json({ conversationId, chatId: conversationId, threadId: conversationId, messages, total: messages.length });
  } catch (err) {
    console.error("Get conversation history error:", err);
    return res.status(500).json({ error: safeError(err, "Failed to fetch conversation history.") });
  }
}

// Clear MemorySaver state for conversation
export async function clearConversationHandler(req, res) {
  try {
    const conversationId = extractConversationId(req);
    if (checkpointer && typeof checkpointer.deleteThread === "function") {
      await checkpointer.deleteThread(conversationId);
    }
    return res.json({ message: `Memory checkpoint deleted for "${conversationId}".`, conversationId, chatId: conversationId });
  } catch (err) {
    console.error("Clear conversation error:", err);
    return res.status(500).json({ error: safeError(err, "Failed to clear conversation memory.") });
  }
}
