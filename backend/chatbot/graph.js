import { StateGraph, MessagesAnnotation, START, END, MemorySaver } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getChatModelWithFallbacks } from "../models/llm.js";
import { tools } from "./tools.js";
import "dotenv/config";

const llm = getChatModelWithFallbacks(tools);

const defaultSystemMessage = new SystemMessage(
  "You are EideticAI, an advanced AI enterprise knowledge and research assistant powered by LangGraph.\n" +
  "You maintain conversation context across turns using session checkpoints.\n\n" +
  "CORE TOOL USAGE RULES:\n" +
  "1. Document Retrieval (RAG): ONLY call 'search_uploaded_documents' when the user explicitly asks a question regarding their uploaded files, PDFs, reports, or policies. Do NOT call this tool for normal conversation or unrelated follow-ups.\n" +
  "2. Normal Chat & Logic: For greetings, chit-chat, conversational follow-ups, user preferences, general questions, math, programming, or everyday conversation, ALWAYS answer directly WITHOUT using any tools.\n" +
  "3. Live Web Search: For real-time news, today's events, or web data, call 'tavily_search'.\n\n" +
  "STRICT OUTPUT FORMATTING & TYPOGRAPHY RULES:\n" +
  "- NEVER output raw markdown tables with vertical pipe characters (do NOT output '| Section | Points |' or '|---|---|').\n" +
  "- DO NOT overuse bold asterisks (**). Use bold ONLY for primary section headers and brief category labels (e.g. **Summary**, **Key Takeaways**). Do NOT bold regular descriptions, body sentences, or contact details.\n" +
  "- Structure document summaries cleanly:\n" +
  "  • Provide a concise 1-2 sentence overview first.\n" +
  "  • Use clean bullet points (•) for details with clear, readable phrasing.\n" +
  "  • When listing sub-items, indent with '  – ' for clear visual hierarchy.\n" +
  "- Only include citations (e.g., '(Page 2)') if explicitly requested or strictly relevant.\n" +
  "- Keep spacing natural and comfortable to read."
);

async function chatbotAgentNode(state) {
  const hasSystem = state.messages.length > 0 && state.messages[0]._getType?.() === "system";
  const messagesToSend = hasSystem ? state.messages : [defaultSystemMessage, ...state.messages];
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

export const checkpointer = new MemorySaver();
export const chatbotApp = workflow.compile({ checkpointer });
export default chatbotApp;

