import {
  StateGraph,
  MessagesAnnotation,
  START,
  END,
  MemorySaver,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import { MongoClient } from "mongodb";
import { getChatModelWithFallbacks } from "../llm_models/llm.js";
import { tools } from "./tools.js";
import "dotenv/config";

const llm = getChatModelWithFallbacks(tools);

const defaultSystemMessage = new SystemMessage(
  "You are EideticAI, an advanced AI enterprise knowledge and research assistant powered by LangGraph.\n" +
    "You maintain conversation context across turns using session checkpoints.\n\n" +
    "CRITICAL: UPLOADED DOCUMENTS & KNOWLEDGE BASE RULES\n" +
    "- Users upload files (PDFs, contracts, invoices, policies, reports, papers) via the interface. Uploaded documents are automatically indexed in the vector database—they are NOT pasted into the user's chat message text.\n" +
    "- Whenever the user asks to 'summarize', 'summarize this', 'give an overview', 'what is this document about', 'explain this', or asks any question referencing their document/file/PDF/contract/report, NEVER ask the user to share, upload, or paste the document.\n" +
    "- You MUST ALWAYS immediately call the 'search_uploaded_documents' tool to inspect and retrieve the document content.\n" +
    "- For generic summary requests (e.g., 'summarize', 'summarize this document', 'key takeaways'), invoke 'search_uploaded_documents' with broad descriptive search terms like 'overview summary executive summary main purpose key findings introduction'.\n" +
    "- Only if 'search_uploaded_documents' returns no matching content at all, politely inform the user that no content could be retrieved from the uploaded documents for this session.\n\n" +
    "CORE TOOL USAGE RULES:\n" +
    "1. Document Retrieval (RAG): Call 'search_uploaded_documents' whenever the user refers to their uploaded files, asks for summaries, or asks questions requiring knowledge from their documents. DO NOT ask the user to provide text if you haven't searched the knowledge base.\n" +
    "2. Normal Chat & Logic: For everyday greetings, conversational chit-chat, user preferences, programming, math, or purely general questions that do not mention or depend on uploaded files, answer directly WITHOUT calling tools.\n" +
    "3. Live Web Search: For real-time news, current events, or live external data, call 'tavily_search'.\n\n" +
    "STRICT OUTPUT FORMATTING & TYPOGRAPHY RULES:\n" +
    "- NEVER output raw markdown tables with vertical pipe characters (do NOT output '| Section | Points |' or '|---|---|').\n" +
    "- DO NOT overuse bold asterisks (**). Use bold ONLY for primary section headers and brief category labels (e.g. **Summary**, **Key Takeaways**). Do NOT bold regular descriptions, body sentences, or contact details.\n" +
    "- Structure document summaries cleanly:\n" +
    "  • Provide a concise 1-2 sentence overview first.\n" +
    "  • Use clean bullet points (•) for details with clear, readable phrasing.\n" +
    "  • When listing sub-items, indent with '  – ' for clear visual hierarchy.\n" +
    "- Only include citations (e.g., '(Page 2)') if explicitly requested or strictly relevant.\n" +
    "- Keep spacing natural and comfortable to read.",
);

async function chatbotAgentNode(state) {
  const hasSystem = state.messages.some(
    (m) => m._getType?.() === "system" || m.constructor?.name === "SystemMessage"
  );
  const messagesToSend = hasSystem
    ? state.messages
    : [defaultSystemMessage, ...state.messages];
  const response = await llm.invoke(messagesToSend);
  return { messages: [response] };
}

function routeAgentDecision(state) {
  const last = state.messages[state.messages.length - 1];
  return last?.tool_calls?.length > 0 ? "call_tools" : "finish_turn";
}

const workflow = new StateGraph(MessagesAnnotation)
  .addNode("chatbot_agent", chatbotAgentNode)
  .addNode("tools", new ToolNode(tools))
  .addEdge(START, "chatbot_agent")
  .addConditionalEdges("chatbot_agent", routeAgentDecision, {
    call_tools: "tools",
    finish_turn: END,
  })
  .addEdge("tools", "chatbot_agent");

let checkpointer;
if (process.env.MONGODB_URI) {
  try {
    const mongoClient = new MongoClient(process.env.MONGODB_URI);
    checkpointer = new MongoDBSaver({
      client: mongoClient,
      dbName: process.env.MONGODB_DB_NAME || "eideticai",
    });
    console.log("[LangGraph] MongoDBSaver checkpointer initialized");
  } catch (err) {
    console.warn(
      `[LangGraph] Failed to init MongoDBSaver, using MemorySaver: ${err.message}`,
    );
    checkpointer = new MemorySaver();
  }
} else {
  checkpointer = new MemorySaver();
}

export { checkpointer };
export const chatbotApp = workflow.compile({ checkpointer });
export default chatbotApp;
