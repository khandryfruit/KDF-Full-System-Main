/**
 * Hybrid product search: exact name > synonym/alias > lexical > embedding similarity.
 * User → Product Search → Matching Products → GPT (never GPT-only retrieval).
 */
import { db, shopifyProductSearchIndexTable, shopifyProductsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  expandWaProductSearchTerms,
  searchShopifyProductIdsByAlias,
  WA_PRODUCT_ALIASES,
} from "./shopifyProductSearch.js";
import {
  productBelongsToFamilies,
  resolveQueryFamilies,
  expandFamilyTerms,
} from "./catalogProductMatcher.js";
import { buildProductSearchMeta, buildSearchDocument, type ProductSearchMeta } from "./productSearchMeta.js";
import {
  cosineSimilarity,
  DEFAULT_EMBEDDING_MODEL,
  embedQuery,
  embedTexts,
} from "./productEmbeddings.js";
import { logger } from "./logger.js";

const INDEX_CACHE_TTL_MS = 90_000;
const EMBED_BATCH = 64;
const MIN_EMBED_SIMILARITY = 0.72;

type ScoredHit = {
  shopifyProductId: string;
  score: number;
  method: string;
  similarity?: number;
};

type CachedIndexRow = {
  shopifyProductId: string;
  searchMeta: ProductSearchMeta;
  searchDocument: string;
  embedding: number[] | null;
};

let indexCache: { at: number; rows: CachedIndexRow[] } | null = null;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandQueryTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const t of expandWaProductSearchTerms(query)) terms.add(t);
  const q = normalizeText(query);
  if (q) terms.add(q);
  for (const token of q.split(/\s+/)) {
    if (token.length >= 2) terms.add(token);
    for (const syn of WA_PRODUCT_ALIASES[token] ?? []) terms.add(normalizeText(syn));
  }
  return [...terms].filter((t) => t.length >= 1);
}

async function loadSearchIndexCache(): Promise<CachedIndexRow[]> {
  const now = Date.now();
  if (indexCache && now - indexCache.at < INDEX_CACHE_TTL_MS) return indexCache.rows;

  try {
    const rows = await db
      .select({
        shopifyProductId: shopifyProductSearchIndexTable.shopifyProductId,
        searchMeta: shopifyProductSearchIndexTable.searchMeta,
        searchDocument: shopifyProductSearchIndexTable.searchDocument,
        embedding: shopifyProductSearchIndexTable.embedding,
      })
      .from(shopifyProductSearchIndexTable);

    const parsed: CachedIndexRow[] = rows.map((r) => ({
      shopifyProductId: r.shopifyProductId,
      searchMeta: (r.searchMeta ?? {}) as ProductSearchMeta,
      searchDocument: r.searchDocument ?? "",
      embedding: Array.isArray(r.embedding) ? (r.embedding as number[]) : null,
    }));
    indexCache = { at: now, rows: parsed };
    return parsed;
  } catch {
    return [];
  }
}

export function invalidateSearchIndexCache(): void {
  indexCache = null;
}

/** Rebuild multilingual meta + OpenAI embeddings for all active products */
export async function rebuildProductSearchIndex(opts?: {
  shopifyProductId?: string;
  skipEmbeddings?: boolean;
}): Promise<{ indexed: number; embedded: number; model: string }> {
  const where = opts?.shopifyProductId
    ? eq(shopifyProductsTable.shopifyProductId, opts.shopifyProductId)
    : eq(shopifyProductsTable.status, "active");

  const products = await db
    .select({
      shopifyProductId: shopifyProductsTable.shopifyProductId,
      title: shopifyProductsTable.title,
      tags: shopifyProductsTable.tags,
      handle: shopifyProductsTable.handle,
      price: shopifyProductsTable.price,
      variants: shopifyProductsTable.variants,
      inventoryQuantity: shopifyProductsTable.inventoryQuantity,
      collections: shopifyProductsTable.collections,
    })
    .from(shopifyProductsTable)
    .where(where)
    .catch(() => []);

  if (!products.length) return { indexed: 0, embedded: 0, model: DEFAULT_EMBEDDING_MODEL };

  if (opts?.shopifyProductId) {
    await db
      .delete(shopifyProductSearchIndexTable)
      .where(eq(shopifyProductSearchIndexTable.shopifyProductId, opts.shopifyProductId))
      .catch(() => {});
  } else {
    await db.delete(shopifyProductSearchIndexTable).catch(() => {});
  }

  const docs: Array<{
    shopifyProductId: string;
    searchMeta: ProductSearchMeta;
    searchDocument: string;
  }> = [];

  for (const p of products) {
    const meta = buildProductSearchMeta(p);
    docs.push({
      shopifyProductId: p.shopifyProductId,
      searchMeta: meta,
      searchDocument: buildSearchDocument(meta),
    });
  }

  let embedded = 0;
  const embeddings: (number[] | null)[] = new Array(docs.length).fill(null);

  if (!opts?.skipEmbeddings) {
    try {
      for (let i = 0; i < docs.length; i += EMBED_BATCH) {
        const chunk = docs.slice(i, i + EMBED_BATCH);
        const vecs = await embedTexts(chunk.map((d) => d.searchDocument));
        for (let j = 0; j < vecs.length; j++) {
          embeddings[i + j] = vecs[j] ?? null;
          if (vecs[j]?.length) embedded++;
        }
      }
    } catch (err) {
      logger.warn({ err }, "Product embedding batch failed — meta index saved without vectors");
    }
  }

  const BATCH = 40;
  let indexed = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH);
    const values = chunk.map((d, j) => ({
      shopifyProductId: d.shopifyProductId,
      searchMeta: d.searchMeta as unknown as Record<string, unknown>,
      searchDocument: d.searchDocument,
      embedding: embeddings[i + j] ?? null,
      embeddingModel: embeddings[i + j] ? DEFAULT_EMBEDDING_MODEL : null,
      updatedAt: new Date(),
    }));
    try {
      await db.insert(shopifyProductSearchIndexTable).values(values as any);
      indexed += chunk.length;

      for (let k = 0; k < chunk.length; k++) {
        const vec = embeddings[i + k];
        if (!vec?.length) continue;
        const id = chunk[k]!.shopifyProductId;
        const vecLiteral = `[${vec.join(",")}]`;
        try {
          await db.execute(sql`
            UPDATE shopify_product_search_index
            SET embedding_vector = ${vecLiteral}::vector
            WHERE shopify_product_id = ${id}
              AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
          `);
        } catch {
          /* pgvector optional */
        }
      }
    } catch (err) {
      logger.warn({ err, batch: i }, "shopify_product_search_index batch insert failed");
      for (const row of values) {
        try {
          await db.insert(shopifyProductSearchIndexTable).values(row as any);
          indexed++;
        } catch { /* skip */ }
      }
    }
  }

  invalidateSearchIndexCache();
  return { indexed, embedded, model: DEFAULT_EMBEDDING_MODEL };
}

async function scoreExactAndSynonym(
  query: string,
  terms: string[],
  families: string[],
): Promise<ScoredHit[]> {
  const hits = new Map<string, ScoredHit>();
  const qNorm = normalizeText(query);

  const add = (id: string, score: number, method: string) => {
    const prev = hits.get(id);
    if (!prev || score > prev.score) hits.set(id, { shopifyProductId: id, score, method });
  };

  const indexRows = await loadSearchIndexCache();
  for (const row of indexRows) {
    const meta = row.searchMeta;
    const nameNorm = normalizeText(meta.name);
    if (qNorm && nameNorm === qNorm) {
      add(row.shopifyProductId, 220, "exact_title");
      continue;
    }
    if (qNorm.length >= 3 && nameNorm.includes(qNorm)) {
      add(row.shopifyProductId, 190, "exact_title_contains");
    }
    for (const term of terms) {
      if (term.length < 2) continue;
      if (nameNorm === term) add(row.shopifyProductId, 210, "exact_name_token");
      if (meta.urdu_name && meta.urdu_name.includes(term)) add(row.shopifyProductId, 200, "exact_urdu");
      if (meta.roman_keywords.some((k) => k === term || k.includes(term))) add(row.shopifyProductId, 175, "synonym_roman");
      if (meta.keywords.some((k) => k === term)) add(row.shopifyProductId, 165, "synonym_keyword");
    }
  }

  const aliasIds = await searchShopifyProductIdsByAlias(query, 60);
  for (const id of aliasIds) add(id, 180, "exact_alias");

  if (families.length) {
    const familyTerms = expandFamilyTerms(families);
    for (const row of indexRows) {
      const blob = `${row.searchMeta.name} ${row.searchMeta.keywords.join(" ")} ${row.searchMeta.roman_keywords.join(" ")}`;
      if (familyTerms.some((f) => f.length >= 3 && normalizeText(blob).includes(f))) {
        add(row.shopifyProductId, Math.max(hits.get(row.shopifyProductId)?.score ?? 0, 140), "family_synonym");
      }
    }
  }

  return [...hits.values()];
}

async function scoreEmbedding(query: string, families: string[]): Promise<ScoredHit[]> {
  const indexRows = await loadSearchIndexCache();
  const withEmb = indexRows.filter((r) => r.embedding?.length);
  if (!withEmb.length) return [];

  let queryVec: number[];
  try {
    queryVec = await embedQuery(query);
  } catch (err) {
    logger.warn({ err }, "Query embedding failed");
    return [];
  }

  if (pgvectorSearchAvailable()) {
    try {
      const vecLiteral = `[${queryVec.join(",")}]`;
      const result = await db.execute(sql`
        SELECT shopify_product_id,
               1 - (embedding_vector <=> ${vecLiteral}::vector) AS similarity
        FROM shopify_product_search_index
        WHERE embedding_vector IS NOT NULL
        ORDER BY embedding_vector <=> ${vecLiteral}::vector
        LIMIT 25
      `);
      const rows = ((result as any).rows ?? result ?? []) as Array<{
        shopify_product_id: string;
        similarity: number;
      }>;
      return rows
        .filter((r) => Number(r.similarity) >= MIN_EMBED_SIMILARITY)
        .map((r) => ({
          shopifyProductId: r.shopify_product_id,
          score: Math.round(Number(r.similarity) * 90),
          method: "embedding_pgvector",
          similarity: Number(r.similarity),
        }));
    } catch {
      /* fallback to in-memory */
    }
  }

  const scored: ScoredHit[] = [];
  for (const row of withEmb) {
    const sim = cosineSimilarity(queryVec, row.embedding!);
    if (sim < MIN_EMBED_SIMILARITY) continue;
    if (families.length) {
      const meta = row.searchMeta;
      if (!productBelongsToFamilies(meta.name, meta.keywords.join(","), "", families)) continue;
    }
    scored.push({
      shopifyProductId: row.shopifyProductId,
      score: Math.round(sim * 85),
      method: "embedding_cosine",
      similarity: sim,
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 25);
}

let pgvectorChecked = false;
let pgvectorOk = false;

function pgvectorSearchAvailable(): boolean {
  return pgvectorOk;
}

export async function checkPgvectorAvailable(): Promise<boolean> {
  if (pgvectorChecked) return pgvectorOk;
  try {
    const r = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'shopify_product_search_index'
          AND column_name = 'embedding_vector'
      ) AS ok
    `);
    pgvectorOk = Boolean((r as any).rows?.[0]?.ok ?? (r as any)[0]?.ok);
  } catch {
    pgvectorOk = false;
  }
  pgvectorChecked = true;
  return pgvectorOk;
}

export type HybridSearchDebug = {
  query: string;
  families: string[];
  terms: string[];
  methods: Record<string, number>;
  topHits: Array<{ shopifyProductId: string; name: string; score: number; method: string; similarity?: number }>;
  embeddingIndexSize: number;
  usedEmbedding: boolean;
};

/** Merge hybrid scores then map to catalog products via existing row mapper */
export async function hybridSearchProductIds(
  query: string,
  lexicalScores: Map<string, number>,
): Promise<{ ids: ScoredHit[]; debug: Partial<HybridSearchDebug> }> {
  const q = String(query ?? "").trim();
  if (!q) return { ids: [], debug: {} };

  const families = resolveQueryFamilies(q);
  const terms = expandQueryTerms(q);

  const exactHits = await scoreExactAndSynonym(q, terms, families);
  const embedHits = await scoreEmbedding(q, families);

  const merged = new Map<string, ScoredHit>();

  for (const [id, lexScore] of lexicalScores) {
    merged.set(id, {
      shopifyProductId: id,
      score: lexScore,
      method: "lexical",
    });
  }

  for (const hit of [...exactHits, ...embedHits]) {
    const prev = merged.get(hit.shopifyProductId);
    if (!prev || hit.score > prev.score) {
      merged.set(hit.shopifyProductId, hit);
    } else if (prev && hit.method.startsWith("embedding")) {
      merged.set(hit.shopifyProductId, {
        ...prev,
        score: prev.score + Math.round((hit.similarity ?? 0) * 15),
        method: `${prev.method}+${hit.method}`,
        similarity: hit.similarity,
      });
    }
  }

  const methods: Record<string, number> = {};
  for (const h of merged.values()) {
    const m = h.method.split("+")[0] ?? h.method;
    methods[m] = (methods[m] ?? 0) + 1;
  }

  const sorted = [...merged.values()].sort((a, b) => b.score - a.score);

  return {
    ids: sorted,
    debug: {
      query: q,
      families,
      terms,
      methods,
      usedEmbedding: embedHits.length > 0,
      embeddingIndexSize: (await loadSearchIndexCache()).filter((r) => r.embedding?.length).length,
    },
  };
}

export async function getProductSearchIndexStats(): Promise<{
  searchIndexRows: number;
  embeddedRows: number;
  embeddingModel: string | null;
}> {
  let searchIndexRows = 0;
  let embeddedRows = 0;
  let embeddingModel: string | null = null;
  try {
    const total = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM shopify_product_search_index`);
    searchIndexRows = Number((total as any).rows?.[0]?.cnt ?? 0);
    const emb = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM shopify_product_search_index WHERE embedding IS NOT NULL
    `);
    embeddedRows = Number((emb as any).rows?.[0]?.cnt ?? 0);
    const modelRow = await db.execute(sql`
      SELECT embedding_model FROM shopify_product_search_index WHERE embedding_model IS NOT NULL LIMIT 1
    `);
    embeddingModel = (modelRow as any).rows?.[0]?.embedding_model ?? null;
  } catch {
    /* migration pending */
  }
  return { searchIndexRows, embeddedRows, embeddingModel };
}

export async function rebuildFullProductKnowledgeIndex(opts?: {
  shopifyProductId?: string;
  skipEmbeddings?: boolean;
}): Promise<{
  aliases: { indexed: number; aliases: number };
  searchIndex: { indexed: number; embedded: number; model: string };
}> {
  const { rebuildShopifyProductAliases } = await import("./shopifyProductSearch.js");
  const aliases = await rebuildShopifyProductAliases(
    opts?.shopifyProductId ? { shopifyProductId: opts.shopifyProductId } : undefined,
  );
  const searchIndex = await rebuildProductSearchIndex(opts);
  await checkPgvectorAvailable();
  return { aliases, searchIndex };
}
