import { TavilySearch } from "@langchain/tavily";
import { tool } from "@langchain/core/tools";
import { getQdrantVectorStore } from "../config/connections.js";
import "dotenv/config";

// 1. Document Search (RAG) Tool
export const documentSearchTool = tool(
  async (args, config) => {
    // 1. Safely extract query and guard against empty inputs (prevents OpenRouter 400 validation error)
    const rawQuery = args?.query || args?.input || "";
    let query = typeof rawQuery === "string" ? rawQuery.trim() : "";
    if (!query) {
      return ["No search terms provided. Please provide a specific question or topic to search for in your uploaded documents.", []];
    }

    // Expand generic summarization queries to match overview, executive summary, and key introductory content
    const lower = query.toLowerCase();
    if (
      lower === "summarize" ||
      lower === "summary" ||
      lower === "summarize this" ||
      lower === "summarize this document" ||
      lower === "summarize document" ||
      lower === "overview" ||
      lower === "what is this document about"
    ) {
      query = "overview summary executive summary main purpose key findings introduction table of contents";
    }

    const chatId = config?.configurable?.thread_id;
    if (!chatId) return ["No active chat identified.", []];

    try {
      const vectorStore = await getQdrantVectorStore("rag_documents");
      const docs = await vectorStore.similaritySearch(query, 6, {
        should: [
          { key: "metadata.chatId", match: { value: chatId } },
          { key: "metadata.conversationId", match: { value: chatId } }, // backward compatibility for previously indexed docs
        ],
      });

      if (!docs || docs.length === 0) {
        return [`No relevant content found in uploaded documents for: "${query}".`, []];
      }

      const formatted = docs
        .map((doc, idx) => `--- Excerpt ${idx + 1} (${doc.metadata?.source || "Doc"}, Page ${doc.metadata?.page || "N/A"}) ---\n${doc.pageContent}`)
        .join("\n\n");

      const sources = docs.map((d) => ({
        source: d.metadata?.source || "Uploaded Document",
        page: d.metadata?.page || null,
      }));

      return [formatted, sources];
    } catch (err) {
      console.warn(`[Document Search Tool Warning] ${err.message}`);
      return [`Retrieval error: ${err.message}`, []];
    }
  },
  {
    name: "search_uploaded_documents",
    description: "Search and retrieve relevant excerpts and content from documents uploaded by the user in this conversation. MUST be used whenever the user asks about their document, PDF, report, or contract, or asks to summarize, explain, or extract details from their files.",
    schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search terms or question to look up in the uploaded documents. For summaries, use descriptive terms such as 'overview summary key points purpose'. Must not be empty.",
        },
      },
      required: ["query"],
    },
    responseFormat: "content_and_artifact",
  }
);

// 2. Tavily Web Search Tool
export const searchTool = process.env.TAVILY_API_KEY?.trim()
  ? new TavilySearch({
      searchDepth: "advanced",
      topic: "general",
      maxResults: 3,
      timeRange: "day",
      includeRawContent: false,
      includeImages: false,
      apiKey: process.env.TAVILY_API_KEY.trim(),
    })
  : tool(
      async ({ query }) => `[Notice: TAVILY_API_KEY missing. Query: "${query}"]`,
      {
        name: "tavily_search",
        description: "Search the web for current information or news.",
        schema: {
          type: "object",
          properties: { query: { type: "string", description: "Search query" } },
          required: ["query"],
        },
      }
    );

export const tools = [documentSearchTool, searchTool];
export default tools;
