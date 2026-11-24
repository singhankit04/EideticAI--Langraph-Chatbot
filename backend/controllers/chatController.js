import { randomUUID } from "node:crypto";
import { HumanMessage } from "@langchain/core/messages";
import { chatbotApp, checkpointer } from "../chatbot/graph.js";
import { Chat } from "../models/Chat.js";
import { Message } from "../models/Message.js";

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

// Handle chat messages with LangGraph agent via Server-Sent Events (SSE) streaming
export async function chatHandler(req, res) {
  const chatId = extractChatId(req);
  const rawQuestion =
    req.body?.message ||
    req.body?.question ||
    (Array.isArray(req.body?.messages)
      ? req.body.messages[req.body.messages.length - 1]?.content
      : undefined);

  if (!rawQuestion || !String(rawQuestion).trim()) {
    return res
      .status(400)
      .json({ error: "A valid 'message' or 'question' field is required." });
  }

  const question = String(rawQuestion).trim();
  const userId = req.user?._id || req.userId;

  // If user is authenticated, ensure Chat session exists and record user message
  let activeChat = null;
  if (userId) {
    try {
      activeChat = await Chat.findOne({ chatId, userId });
      if (!activeChat) {
        const autoTitle =
          question.length > 40 ? `${question.slice(0, 37)}...` : question;
        activeChat = await Chat.create({
          userId,
          chatId,
          title: autoTitle || "New Conversation",
        });
      }

      await Message.create({
        chatId,
        userId,
        role: "human",
        content: question,
      });
    } catch (dbErr) {
      console.warn("[ChatHandler DB Warning]:", dbErr.message);
    }
  }

  // Set SSE response headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable proxy buffering for Nginx
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const eventStream = chatbotApp.streamEvents(
      { messages: [new HumanMessage(question)] },
      { configurable: { thread_id: chatId }, version: "v2" },
    );

    const sources = [];
    const seenSources = new Set();
    let accumulatedResponse = "";

    for await (const event of eventStream) {
      // 1. Tool execution notifications
      if (event.event === "on_tool_start") {
        const toolName = event.name || "tool";
        const message =
          toolName === "search_uploaded_documents"
            ? "Searching uploaded documents..."
            : toolName === "tavily_search"
              ? "Searching the web..."
              : `Running ${toolName}...`;
        sendEvent("status", { message, tool: toolName });
      }

      // 2. Collect sources when document retrieval tool finishes
      if (
        event.event === "on_tool_end" &&
        event.name === "search_uploaded_documents"
      ) {
        const output = event.data?.output;
        const candidateArtifact =
          Array.isArray(output) && output.length > 1
            ? output[1]
            : output?.artifact;
        if (Array.isArray(candidateArtifact)) {
          for (const item of candidateArtifact) {
            const key = `${item.source}:${item.page}`;
            if (!seenSources.has(key)) {
              seenSources.add(key);
              sources.push(item);
            }
          }
        }
      }

      // 3. Stream generated answer tokens directly as they arrive from LLM
      if (event.event === "on_chat_model_stream") {
        const chunk = event.data?.chunk;
        const content = chunk?.content;
        const hasToolCall =
          chunk?.tool_call_chunks && chunk.tool_call_chunks.length > 0;

        if (typeof content === "string" && content.length > 0 && !hasToolCall) {
          accumulatedResponse += content;
          sendEvent("token", { token: content });
        }
      }
    }

    // 4. Send citations/sources gathered during this turn
    if (sources.length > 0) {
      sendEvent("sources", { sources });
    }

    // 5. Persist assistant response & update chat metadata if user is authenticated
    if (userId && accumulatedResponse) {
      try {
        await Message.create({
          chatId,
          userId,
          role: "assistant",
          content: accumulatedResponse,
          sources: sources.length > 0 ? sources : [],
        });

        const updateFields = { lastMessageAt: new Date() };
        if (activeChat && activeChat.title === "New Conversation") {
          updateFields.title =
            question.length > 40 ? `${question.slice(0, 37)}...` : question;
        }

        await Chat.updateOne(
          { chatId, userId },
          { $set: updateFields },
        );
      } catch (dbErr) {
        console.warn("[ChatHandler Save AI Msg Warning]:", dbErr.message);
      }
    }

    // 6. Send completion event with unified chatId
    sendEvent("done", { chatId });

    res.write("data: [DONE]\n\n");
    return res.end();
  } catch (err) {
    console.error("Chat handler streaming error:", err);
    sendEvent("error", {
      error: safeError(err, "Failed to stream chat response."),
    });
    res.write("data: [DONE]\n\n");
    return res.end();
  }
}

// Retrieve message history (from MongoDB Message collection if user is authenticated, else checkpointer)
export async function getConversationHistoryHandler(req, res) {
  try {
    const chatId = extractChatId(req);
    const userId = req.user?._id || req.userId;

    if (userId) {
      const messages = await Message.find({ chatId, userId })
        .sort({ createdAt: 1 })
        .lean();

      if (messages.length > 0) {
        return res.json({
          chatId,
          messages,
          total: messages.length,
        });
      }
    }

    // Fallback: Read state directly from LangGraph checkpointer
    const state = await chatbotApp.getState({
      configurable: { thread_id: chatId },
    });

    const messages = (state?.values?.messages || []).map((msg) => ({
      role:
        msg._getType?.() ||
        (msg.constructor?.name === "HumanMessage" ? "human" : "ai"),
      content: msg.content,
      name: msg.name,
      id: msg.id,
    }));

    return res.json({
      chatId,
      messages,
      total: messages.length,
    });
  } catch (err) {
    console.error("Get conversation history error:", err);
    return res
      .status(500)
      .json({ error: safeError(err, "Failed to fetch conversation history.") });
  }
}

// List all chat conversations for authenticated user
export async function getUserChatsHandler(req, res) {
  try {
    const userId = req.user?._id || req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const chats = await Chat.find({ userId })
      .sort({ isPinned: -1, lastMessageAt: -1, updatedAt: -1 })
      .lean();

    return res.json({ chats, total: chats.length });
  } catch (err) {
    console.error("[Get User Chats Error]:", err);
    return res
      .status(500)
      .json({ error: safeError(err, "Failed to fetch user chat list.") });
  }
}

// Create a new chat session for authenticated user
export async function createChatHandler(req, res) {
  try {
    const userId = req.user?._id || req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const chatId =
      req.body?.chatId && String(req.body.chatId).trim()
        ? String(req.body.chatId).trim()
        : randomUUID();

    const title =
      req.body?.title && String(req.body.title).trim()
        ? String(req.body.title).trim()
        : "New Conversation";

    const chat = await Chat.create({
      userId,
      chatId,
      title,
    });

    return res.status(201).json({ chat });
  } catch (err) {
    console.error("[Create Chat Error]:", err);
    return res
      .status(500)
      .json({ error: safeError(err, "Failed to create conversation session.") });
  }
}

// Get messages and metadata for a specific chat
export async function getChatMessagesHandler(req, res) {
  try {
    const userId = req.user?._id || req.userId;
    const chatId = req.params?.chatId || extractChatId(req);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const chat = await Chat.findOne({ chatId, userId }).lean();
    if (!chat) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    const messages = await Message.find({ chatId, userId })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({
      chatId,
      chat,
      messages,
      total: messages.length,
    });
  } catch (err) {
    console.error("[Get Chat Messages Error]:", err);
    return res
      .status(500)
      .json({ error: safeError(err, "Failed to fetch chat messages.") });
  }
}

// Update chat session title or pinned status
export async function updateChatHandler(req, res) {
  try {
    const userId = req.user?._id || req.userId;
    const chatId = req.params?.chatId || extractChatId(req);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const updates = {};
    if (typeof req.body?.title === "string") {
      updates.title = req.body.title.trim();
    }
    if (typeof req.body?.isPinned === "boolean") {
      updates.isPinned = req.body.isPinned;
    }

    const chat = await Chat.findOneAndUpdate(
      { chatId, userId },
      { $set: updates },
      { new: true },
    ).lean();

    if (!chat) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    return res.json({ chat });
  } catch (err) {
    console.error("[Update Chat Error]:", err);
    return res
      .status(500)
      .json({ error: safeError(err, "Failed to update chat.") });
  }
}

// Delete chat session, its messages, and clear LangGraph checkpointer state
export async function deleteChatHandler(req, res) {
  try {
    const userId = req.user?._id || req.userId;
    const chatId = req.params?.chatId || extractChatId(req);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const deleted = await Chat.findOneAndDelete({ chatId, userId });
    if (!deleted) {
      return res.status(404).json({ error: "Conversation not found." });
    }

    await Message.deleteMany({ chatId, userId });

    if (checkpointer && typeof checkpointer.deleteThread === "function") {
      await checkpointer.deleteThread(chatId).catch(() => {});
    }

    return res.json({
      message: `Conversation "${chatId}" deleted successfully.`,
      chatId,
    });
  } catch (err) {
    console.error("[Delete Chat Error]:", err);
    return res
      .status(500)
      .json({ error: safeError(err, "Failed to delete chat.") });
  }
}

// Clear messages and checkpointer for a chat (keeps the chat record)
export async function clearConversationHandler(req, res) {
  try {
    const chatId = extractChatId(req);
    const userId = req.user?._id || req.userId;

    if (userId) {
      await Message.deleteMany({ chatId, userId });
    }

    if (checkpointer && typeof checkpointer.deleteThread === "function") {
      await checkpointer.deleteThread(chatId).catch(() => {});
    }

    return res.json({
      message: `Memory checkpoint deleted for "${chatId}".`,
      chatId,
    });
  } catch (err) {
    console.error("Clear conversation error:", err);
    return res
      .status(500)
      .json({ error: safeError(err, "Failed to clear conversation memory.") });
  }
}

export default {
  chatHandler,
  getConversationHistoryHandler,
  clearConversationHandler,
  getUserChatsHandler,
  createChatHandler,
  getChatMessagesHandler,
  updateChatHandler,
  deleteChatHandler,
  extractChatId,
  safeError,
};
