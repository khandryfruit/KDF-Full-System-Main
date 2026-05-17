/**
 * OpenAI embeddings for product search (text-embedding-3-small by default).
 */
import { resolveOpenAIClient } from "./resolveOpenAI.js";
import { logger } from "./logger.js";

export const DEFAULT_EMBEDDING_MODEL =
  process.env.PRODUCT_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";

const EMBEDDING_DIM = 1536;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const { client } = await resolveOpenAIClient();
  const input = texts.map((t) => String(t ?? "").slice(0, 8000));
  const res = await client.embeddings.create({
    model: DEFAULT_EMBEDDING_MODEL,
    input,
  });
  const sorted = [...res.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => {
    const vec = d.embedding as number[];
    if (vec.length !== EMBEDDING_DIM) {
      logger.warn({ model: DEFAULT_EMBEDDING_MODEL, dim: vec.length }, "Unexpected embedding dimension");
    }
    return vec;
  });
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec ?? [];
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}
