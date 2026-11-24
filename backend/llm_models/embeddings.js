
import "dotenv/config";

// Liquid LFM embedding model (1024 dimensions via OpenRouter)
import { OpenAIEmbeddings } from "@langchain/openai";

export const embeddingsModel = new OpenAIEmbeddings({
  model: "nvidia/nemotron-3.5-embed-1b:free",
  apiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: "https://openrouter.ai/api/v1",
  },
});

