import { createHash } from "crypto";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  mediaAssetsTable,
  mediaFoldersTable,
  mediaUsageTable,
  productsTable,
  categoriesTable,
  blogPostsTable,
  bannersTable,
} from "@workspace/db/schema";

export function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function findDuplicateByHash(hash: string) {
  const rows = await db
    .select()
    .from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.contentHash, hash))
    .limit(1);
  return rows[0] ?? null;
}

export async function listFolders() {
  return db
    .select()
    .from(mediaFoldersTable)
    .orderBy(mediaFoldersTable.sortOrder);
}

export async function getFolderBySlug(slug: string) {
  const rows = await db
    .select()
    .from(mediaFoldersTable)
    .where(eq(mediaFoldersTable.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export interface ListMediaQuery {
  folderId?: number;
  folderSlug?: string;
  search?: string;
  tags?: string[];
  page?: number;
  limit?: number;
  sort?: "newest" | "oldest" | "name" | "size";
}

export async function listMediaAssets(query: ListMediaQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 48));
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];

  if (query.folderId) {
    conditions.push(eq(mediaAssetsTable.folderId, query.folderId));
  } else if (query.folderSlug) {
    const folder = await getFolderBySlug(query.folderSlug);
    if (folder) conditions.push(eq(mediaAssetsTable.folderId, folder.id));
  }

  if (query.search?.trim()) {
    const q = `%${query.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(mediaAssetsTable.filename, q),
        ilike(mediaAssetsTable.originalFilename, q),
        ilike(mediaAssetsTable.altText, q),
        ilike(mediaAssetsTable.title, q)
      )!
    );
  }

  if (query.tags?.length) {
    for (const tag of query.tags) {
      conditions.push(
        sql`${mediaAssetsTable.tags} @> ${JSON.stringify([tag.toLowerCase()])}::jsonb`
      );
    }
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const orderBy =
    query.sort === "oldest"
      ? mediaAssetsTable.createdAt
      : query.sort === "name"
        ? mediaAssetsTable.filename
        : query.sort === "size"
          ? desc(mediaAssetsTable.processedSize)
          : desc(mediaAssetsTable.createdAt);

  const [items, countRow] = await Promise.all([
    db
      .select()
      .from(mediaAssetsTable)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(mediaAssetsTable)
      .where(where),
  ]);

  return {
    items,
    total: countRow[0]?.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countRow[0]?.count ?? 0) / limit),
  };
}

export async function getMediaAsset(id: number) {
  const rows = await db
    .select()
    .from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function registerMediaUsage(opts: {
  mediaId: number;
  entityType: string;
  entityId: number;
  fieldName?: string;
}) {
  await db
    .insert(mediaUsageTable)
    .values({
      mediaId: opts.mediaId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      fieldName: opts.fieldName ?? null,
    })
    .onConflictDoNothing();
}

export async function unregisterMediaUsage(opts: {
  mediaId: number;
  entityType: string;
  entityId: number;
  fieldName?: string;
}) {
  const conds = [
    eq(mediaUsageTable.mediaId, opts.mediaId),
    eq(mediaUsageTable.entityType, opts.entityType),
    eq(mediaUsageTable.entityId, opts.entityId),
  ];
  if (opts.fieldName) {
    conds.push(eq(mediaUsageTable.fieldName, opts.fieldName));
  }
  await db.delete(mediaUsageTable).where(and(...conds));
}

export interface UsageRef {
  entityType: string;
  entityId: number;
  fieldName?: string | null;
  label: string;
}

export async function getMediaUsageRecords(mediaId: number): Promise<UsageRef[]> {
  const registered = await db
    .select()
    .from(mediaUsageTable)
    .where(eq(mediaUsageTable.mediaId, mediaId));

  const asset = await getMediaAsset(mediaId);
  if (!asset) return [];

  const paths = new Set<string>([asset.objectPath]);
  const v = asset.variants as Record<string, { path?: string }> | null;
  if (v) {
    for (const key of Object.keys(v)) {
      if (v[key]?.path) paths.add(v[key].path!);
    }
  }

  const pathList = [...paths];
  const scanned = await scanPathUsage(pathList);

  const byKey = new Map<string, UsageRef>();
  for (const u of registered) {
    byKey.set(`${u.entityType}:${u.entityId}:${u.fieldName ?? ""}`, {
      entityType: u.entityType,
      entityId: u.entityId,
      fieldName: u.fieldName,
      label: formatUsageLabel(u.entityType, u.entityId),
    });
  }
  for (const s of scanned) {
    byKey.set(`${s.entityType}:${s.entityId}:${s.fieldName ?? ""}`, s);
  }

  return [...byKey.values()];
}

function formatUsageLabel(entityType: string, entityId: number): string {
  const names: Record<string, string> = {
    product: "Product",
    category: "Category",
    blog: "Blog post",
    banner: "Banner",
    homepage: "Homepage",
    collection: "Collection",
  };
  return `${names[entityType] ?? entityType} #${entityId}`;
}

async function scanPathUsage(paths: string[]): Promise<UsageRef[]> {
  if (!paths.length) return [];
  const found: UsageRef[] = [];

  const products = await db
    .select({ id: productsTable.id, name: productsTable.name, images: productsTable.images })
    .from(productsTable);
  for (const p of products) {
    const imgs = (p.images as string[] | null) ?? [];
    if (imgs.some((img) => paths.includes(img))) {
      found.push({
        entityType: "product",
        entityId: p.id,
        fieldName: "images",
        label: `Product: ${p.name}`,
      });
    }
  }

  const categories = await db
    .select({ id: categoriesTable.id, name: categoriesTable.name, imageUrl: categoriesTable.imageUrl })
    .from(categoriesTable);
  for (const c of categories) {
    if (c.imageUrl && paths.includes(c.imageUrl)) {
      found.push({
        entityType: "category",
        entityId: c.id,
        fieldName: "imageUrl",
        label: `Category: ${c.name}`,
      });
    }
  }

  const blogs = await db
    .select({
      id: blogPostsTable.id,
      title: blogPostsTable.title,
      featuredImagePath: blogPostsTable.featuredImagePath,
    })
    .from(blogPostsTable);
  for (const b of blogs) {
    if (b.featuredImagePath && paths.includes(b.featuredImagePath)) {
      found.push({
        entityType: "blog",
        entityId: b.id,
        fieldName: "featuredImagePath",
        label: `Blog: ${b.title}`,
      });
    }
  }

  const banners = await db
    .select({
      id: bannersTable.id,
      title: bannersTable.title,
      imageUrl: bannersTable.imageUrl,
      mobileImageUrl: bannersTable.mobileImageUrl,
    })
    .from(bannersTable);
  for (const b of banners) {
    if (b.imageUrl && paths.includes(b.imageUrl)) {
      found.push({
        entityType: "banner",
        entityId: b.id,
        fieldName: "imageUrl",
        label: `Banner: ${b.title}`,
      });
    }
    if (b.mobileImageUrl && paths.includes(b.mobileImageUrl)) {
      found.push({
        entityType: "banner",
        entityId: b.id,
        fieldName: "mobileImageUrl",
        label: `Banner (mobile): ${b.title}`,
      });
    }
  }

  return found;
}

export async function deleteMediaAsset(id: number, force = false) {
  const usage = await getMediaUsageRecords(id);
  if (usage.length > 0 && !force) {
    return { ok: false as const, usage, error: "in_use" };
  }
  await db.delete(mediaUsageTable).where(eq(mediaUsageTable.mediaId, id));
  await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, id));
  return { ok: true as const, usage: [] };
}

export async function resolveMediaIdByPath(objectPath: string): Promise<number | null> {
  const rows = await db
    .select({ id: mediaAssetsTable.id })
    .from(mediaAssetsTable)
    .where(
      or(
        eq(mediaAssetsTable.objectPath, objectPath),
        sql`${mediaAssetsTable.variants}::text LIKE ${"%" + objectPath + "%"}`
      )
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function linkPathToEntity(
  objectPath: string,
  entityType: string,
  entityId: number,
  fieldName?: string
) {
  const id = await resolveMediaIdByPath(objectPath);
  if (id) {
    await registerMediaUsage({ mediaId: id, entityType, entityId, fieldName });
  }
}
