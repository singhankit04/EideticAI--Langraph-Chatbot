import { ChatGroq } from "@langchain/groq";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenRouter } from "@langchain/openrouter";
import "dotenv/config";

// Creates primary LLM (Groq) with fallback providers (Gemini -> OpenRouter)
export function getChatModelWithFallbacks(tools = [], temperature = 0.7) {
  const primary = new ChatGroq({
    apiKey:process.env.GROQ_API_KEY,
    model: "openai/gpt-oss-120b",
    temperature,
  });

  const fallbacks = [
    new ChatGoogleGenerativeAI({
      apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
      model: "gemini-3.5-flash-lite",
      temperature,
    }),
    new ChatOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
      model: "nvidia/nemotron-3.5-lightning:free",
      temperature,
    }),
  ];

  if (tools?.length > 0) {
    return primary.bindTools(tools).withFallbacks({
      fallbacks: fallbacks.map((m) => m.bindTools(tools)),
    });
  }

  return primary.withFallbacks({ fallbacks });
}

export default getChatModelWithFallbacks;
