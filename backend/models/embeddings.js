import { OpenAIEmbeddings } from "@langchain/openai";
import "dotenv/config";

// Liquid LFM embedding model (1024 dimensions via OpenRouter)
export const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: "liquid/lfm-2.5-embedding-350m:free",
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});
// import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

// const embeddings = new GoogleGenerativeAIEmbeddings({
//   model: "gemini-embedding-2",
//   apiKey: process.env.GEMINI_API_KEY,
// });

// export {embeddings} ;
