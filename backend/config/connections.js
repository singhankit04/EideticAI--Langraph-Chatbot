import { QdrantClient } from "@qdrant/js-client-rest";
import { QdrantVectorStore } from "@langchain/qdrant";
import Redis from "ioredis";
import { embeddingsModel } from "../llm_models/embeddings.js";
import "dotenv/config";

// Qdrant Vector Client & Vector Store
export const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

export async function getQdrantVectorStore(collectionName = "rag_documents") {
  return QdrantVectorStore.fromExistingCollection(embeddingsModel, {
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
    collectionName,
  });
}

// Redis client for BullMQ and cache
export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

redis.on("error", (err) => console.warn(`[Redis Warning] ${err.message}`));

// Verify active connections to Redis and Qdrant
export async function checkConnections() {
  console.log("[Connections] Checking external services...");

  // 1. Redis check
  try {
    if (redis.status === "wait") await redis.connect();
    if ((await redis.ping()) === "PONG")
      console.log("[Connections] Redis: Connected");
  } catch (err) {
    console.error(`[Connections] Redis: Connection failed (${err.message})`);
  }

  // 2. Qdrant check & index verification
  try {
    const response = await qdrantClient.getCollections();
    const names = (response.collections || []).map((c) => c.name);
    console.log(
      `[Connections] Qdrant: Connected (collections: [${names.join(", ")}])`,
    );

      if (names.includes("rag_documents")) {
      const info = await qdrantClient.getCollection("rag_documents");
      const currentDim = info.config?.params?.vectors?.size;
      if (currentDim !== 2048) {
        console.log(
          `[Connections] Qdrant: Migrating "rag_documents" from ${currentDim} to 2048 dimensions...`,
        );
        await qdrantClient.deleteCollection("rag_documents");
        await qdrantClient.createCollection("rag_documents", {
          vectors: { size: 2048, distance: "Cosine" },
        });
      }
    } else {
      await qdrantClient.createCollection("rag_documents", {
        vectors: { size: 2048, distance: "Cosine" },
      });
    }

    await qdrantClient
      .createPayloadIndex("rag_documents", {
        field_name: "metadata.chatId",
        field_schema: "keyword",
      })
      .catch(() => {});
    await qdrantClient
      .createPayloadIndex("rag_documents", {
        field_name: "metadata.conversationId",
        field_schema: "keyword",
      })
      .catch(() => {});
  } catch (err) {
    console.error(`[Connections] Qdrant: Connection failed (${err.message})`);
  }
}
