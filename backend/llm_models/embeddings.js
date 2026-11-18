
import "dotenv/config";

// Liquid LFM embedding model (1024 dimensions via OpenRouter)
import { OpenAIEmbeddings } from "@langchain/openai";

export const embeddingsModel = new OpenAIEmbeddings({
  model: "nvidia/nemotron-3-embed-1b:free",
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});
// import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

// export const embeddingsModel = new GoogleGenerativeAIEmbeddings({
//   model: "gemini-embedding-2",
//   apiKey: process.env.GEMINI_API_KEY,
// });

// export {embeddings} ;
