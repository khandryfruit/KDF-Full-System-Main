import { db, productsTable, categoriesTable, branchesTable, branchProductsTable, stockMovementsTable } from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { generateSlugFromName, ensureUniqueSlug } from "./slugify.js";
import { buildProductSeo, tagsWithSeoKeywords } from "./productImportSeo.js";
import {
  emptyRollbackSnapshot,
  type ImportRollbackSnapshot,
  type EcommerceProductSnapshot,
  type BranchProductSnapshot,
} from "./productImportRollback.js";

/** Canonical export/import columns */
export const CATALOG_COLUMNS = [
  "product_name", "sku", "barcode", "category", "subcategory",
  "purchase_price", "sale_price", "stock", "unit", "branch", "brand",
  "description", "tax", "low_stock_alert", "images",
] as const;

export type CatalogRow = {
  rowNum: number;
  productName: string;
  sku: string;
  barcode: string;
  category: string;
  subcategory: string;
  purchasePrice: number | null;
  salePrice: number;
  stock: number;
  unit: string;
  branch: string;
  brand: string;
  description: string;
  tax: string;
  lowStockAlert: number;
  images: string[];
};

export type RowValidation = {
  rowNum: number;
  valid: boolean;
  errors: string[];
  data?: CatalogRow;
};

export type ImportRowResult = {
  rowNum: number;
  ok: boolean;
  productName: string;
  sku: string;
  branchesUpdated: string[];
  action?: "created" | "updated" | "skipped";
  error?: string;
};

export type PreviewSummary = {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  warningCount: number;
  duplicateSkuInFile: string[];
  newCategories: string[];
  newBrands: string[];
  vyaparDetected: boolean;
  valid: RowValidation[];
  invalid: RowValidation[];
  warnings: { rowNum: number; sku: string; messages: string[] }[];
};

const HEADER_ALIASES: Record<string, keyof CatalogRow | "raw"> = {
  product_name: "productName", name: "productName", "product name": "productName", title: "productName",
  item_name: "productName", "item name": "productName", "itemname": "productName",
  sku: "sku", item_code: "sku", "item code": "sku", code: "sku", "item id": "sku", item_id: "sku",
  barcode: "barcode", upc: "barcode", ean: "barcode", "bar code": "barcode",
  category: "category", cat: "category", "item category": "category", product_category: "category",
  subcategory: "subcategory", "sub category": "subcategory", sub_category: "subcategory",
  purchase_price: "purchasePrice", "purchase price": "purchasePrice", cost: "purchasePrice", buy_price: "purchasePrice",
  "cost price": "purchasePrice", cost_price: "purchasePrice",
  sale_price: "salePrice", price: "salePrice", "sale price": "salePrice", selling_price: "salePrice",
  mrp: "salePrice", "selling rate": "salePrice", selling_rate: "salePrice", rate: "salePrice",
  stock: "stock", quantity: "stock", stock_qty: "stock", qty: "stock",
  "stock qty": "stock", "stock quantity": "stock", opening_stock: "stock", "opening stock": "stock",
  "current stock": "stock", available_qty: "stock",
  unit: "unit", uom: "unit", "base unit": "unit",
  branch: "branch", branch_name: "branch", location: "branch", godown: "branch", warehouse: "branch",
  brand: "brand", manufacturer: "brand", company: "brand",
  description: "description", desc: "description", details: "description", remarks: "description",
  tax: "tax", vat: "tax", gst: "tax", "gst(%)": "tax", "gst %": "tax", "tax %": "tax",
  low_stock_alert: "lowStockAlert", low_stock: "lowStockAlert", "low stock": "lowStockAlert", reorder_level: "lowStockAlert",
  images: "images", image: "images", image_url: "images", photos: "images", "image link": "images",
  hsn: "raw", hsn_code: "raw",
};

const VYAPAR_HEADER_HINTS = [
  "item name", "item code", "sale price", "purchase price", "opening stock", "gst",
];

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function cellStr(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v) return v;
  }
  return "";
}

function parseNum(raw: string): number | null {
  const n = parseFloat(String(raw ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Map spreadsheet row → normalized catalog row */
export function mapRawRow(row: Record<string, string>, rowNum: number): RowValidation {
  const mapped: Partial<Record<keyof CatalogRow, string>> = {};
  for (const [header, value] of Object.entries(row)) {
    const alias = HEADER_ALIASES[normHeader(header)];
    if (alias && alias !== "raw") mapped[alias] = value;
  }

  const productName = cellStr(row, "product_name", "name", "Product Name", "title")
    || String((mapped as { productName?: string }).productName ?? "").trim();
  const sku = cellStr(row, "sku", "SKU", "item_code", "item code") || mapped.sku || "";
  const saleRaw = cellStr(row, "sale_price", "price", "Sale Price", "selling_price") || mapped.salePrice || "";
  const errors: string[] = [];

  if (!productName) errors.push("Missing product name");
  const salePrice = parseNum(saleRaw);
  if (salePrice == null || salePrice < 0) errors.push(`Invalid sale price "${saleRaw}"`);

  const purchasePrice = parseNum(cellStr(row, "purchase_price", "Purchase Price", "cost") || mapped.purchasePrice || "");
  const stock = parseNum(cellStr(row, "stock", "Stock", "quantity") || mapped.stock || "0") ?? 0;
  const lowStock = parseNum(cellStr(row, "low_stock_alert", "low_stock") || mapped.lowStockAlert || "1") ?? 1;

  const imgRaw = cellStr(row, "images", "image", "image_url") || mapped.images || "";
  const images = imgRaw ? imgRaw.split(/[|,;]/).map(s => s.trim()).filter(Boolean) : [];

  const categoryFull = cellStr(row, "category", "Category") || mapped.category || "";
  let category = categoryFull;
  let subcategory = cellStr(row, "subcategory", "Subcategory") || mapped.subcategory || "";
  if (categoryFull.includes("/") && !subcategory) {
    const parts = categoryFull.split("/").map(s => s.trim());
    category = parts[0] ?? "";
    subcategory = parts[1] ?? "";
  }

  const data: CatalogRow = {
    rowNum,
    productName: productName.trim(),
    sku: (sku || generateSlugFromName(productName).toUpperCase().slice(0, 20)).trim(),
    barcode: (cellStr(row, "barcode", "Barcode") || mapped.barcode || "").trim(),
    category: category.trim(),
    subcategory: subcategory.trim(),
    purchasePrice: purchasePrice != null && purchasePrice >= 0 ? purchasePrice : null,
    salePrice: salePrice ?? 0,
    stock: Math.max(0, stock),
    unit: (cellStr(row, "unit", "Unit") || mapped.unit || "KG").trim().toUpperCase(),
    branch: (cellStr(row, "branch", "Branch") || mapped.branch || "").trim(),
    brand: (cellStr(row, "brand", "Brand") || mapped.brand || "").trim(),
    description: (cellStr(row, "description", "Description") || mapped.description || "").trim(),
    tax: (cellStr(row, "tax", "Tax", "VAT") || mapped.tax || "").trim(),
    lowStockAlert: Math.max(0, lowStock),
    images,
  };

  return { rowNum, valid: errors.length === 0, errors, data: errors.length === 0 ? data : undefined };
}

export function detectVyaparExport(headers: string[]): boolean {
  const normalized = headers.map(normHeader);
  const hits = VYAPAR_HEADER_HINTS.filter((h) => normalized.some((n) => n.includes(h) || h.includes(n)));
  return hits.length >= 2;
}

export function validateRows(rows: Record<string, string>[]): { valid: RowValidation[]; invalid: RowValidation[] } {
  const valid: RowValidation[] = [];
  const invalid: RowValidation[] = [];
  rows.forEach((row, i) => {
    const v = mapRawRow(row, i + 2);
    if (v.valid) valid.push(v);
    else invalid.push(v);
  });
  return { valid, invalid };
}

/** Full preview with duplicate SKU detection, category/brand warnings, Vyapar detection. */
export async function buildImportPreview(
  rows: Record<string, string>[],
  headers: string[],
): Promise<PreviewSummary> {
  clearImportCaches();
  const { valid, invalid } = validateRows(rows);
  const vyaparDetected = detectVyaparExport(headers);

  const skuOccurrences = new Map<string, number[]>();
  for (const v of valid) {
    const sku = v.data!.sku.toLowerCase();
    if (!skuOccurrences.has(sku)) skuOccurrences.set(sku, []);
    skuOccurrences.get(sku)!.push(v.rowNum);
  }
  const duplicateSkuInFile = [...skuOccurrences.entries()]
    .filter(([, nums]) => nums.length > 1)
    .map(([sku]) => sku);

  const cats = await loadCategories();
  const catNames = new Set(cats.map((c) => c.name.toLowerCase()));
  const newCategories = new Set<string>();
  const newBrands = new Set<string>();
  const warnings: PreviewSummary["warnings"] = [];

  const existingSkus = new Set<string>();
  if (valid.length) {
    const skuList = [...new Set(valid.map((v) => v.data!.sku))].slice(0, 500);
    for (const sku of skuList) {
      const hit = await db
        .select({ externalId: productsTable.externalId })
        .from(productsTable)
        .where(eq(productsTable.externalId, sku))
        .limit(1);
      if (hit.length) existingSkus.add(sku.toLowerCase());
    }
  }

  for (const v of valid) {
    if (!v.data) continue;
    const rowWarnings: string[] = [];
    const d = v.data;

    if (duplicateSkuInFile.includes(d.sku.toLowerCase())) {
      rowWarnings.push("Duplicate SKU in file (last row wins on import)");
    }
    if (existingSkus.has(d.sku.toLowerCase())) {
      rowWarnings.push("SKU exists — will update existing product");
    }
    if (!d.category) rowWarnings.push("No category — product will be uncategorized");
    else if (!catNames.has(d.category.toLowerCase()) && !catNames.has(`${d.category} / ${d.subcategory}`.toLowerCase())) {
      newCategories.add(d.subcategory ? `${d.category} / ${d.subcategory}` : d.category);
      rowWarnings.push(`Category "${d.category}" will be auto-created`);
    }
    if (!d.brand) rowWarnings.push("No brand — stored in tags only if provided later");
    else newBrands.add(d.brand);
    if (!d.description) rowWarnings.push("No description — SEO text will be auto-generated");
    if (!d.images.length) rowWarnings.push("No images");
    if (d.purchasePrice != null && d.purchasePrice > d.salePrice) {
      rowWarnings.push("Purchase price higher than sale price");
    }

    if (rowWarnings.length) {
      warnings.push({ rowNum: v.rowNum, sku: d.sku, messages: rowWarnings });
    }
  }

  return {
    totalRows: rows.length,
    validCount: valid.length,
    invalidCount: invalid.length,
    warningCount: warnings.length,
    duplicateSkuInFile,
    newCategories: [...newCategories],
    newBrands: [...newBrands],
    vyaparDetected,
    valid,
    invalid,
    warnings,
  };
}

let branchCache: { id: number; name: string; city: string; slug: string }[] | null = null;
let categoryCache: { id: number; name: string }[] | null = null;

async function loadBranches() {
  if (!branchCache) {
    branchCache = await db.select({
      id: branchesTable.id,
      name: branchesTable.name,
      city: branchesTable.city,
      slug: branchesTable.slug,
    }).from(branchesTable).where(eq(branchesTable.isActive, true));
  }
  return branchCache;
}

async function loadCategories() {
  if (!categoryCache) {
    categoryCache = await db.select({ id: categoriesTable.id, name: categoriesTable.name }).from(categoriesTable);
  }
  return categoryCache;
}

export function clearImportCaches() {
  branchCache = null;
  categoryCache = null;
}

async function resolveBranchIds(branchLabel: string): Promise<{ ids: number[]; labels: string[] }> {
  const branches = await loadBranches();
  if (!branchLabel || /^all$/i.test(branchLabel) || /^everywhere$/i.test(branchLabel)) {
    return { ids: branches.map(b => b.id), labels: branches.map(b => b.name) };
  }
  const q = branchLabel.toLowerCase();
  const match = branches.filter(b =>
    b.name.toLowerCase() === q ||
    b.city.toLowerCase() === q ||
    b.slug.toLowerCase() === q ||
    b.name.toLowerCase().includes(q) ||
    b.city.toLowerCase().includes(q),
  );
  if (match.length) return { ids: match.map(b => b.id), labels: match.map(b => b.name) };
  const byId = parseInt(branchLabel, 10);
  if (!isNaN(byId)) {
    const b = branches.find(x => x.id === byId);
    if (b) return { ids: [b.id], labels: [b.name] };
  }
  return { ids: [], labels: [] };
}

async function resolveCategoryId(category: string, subcategory: string): Promise<number | undefined> {
  if (!category) return undefined;
  const cats = await loadCategories();
  const name = subcategory ? `${category} / ${subcategory}` : category;
  let hit = cats.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (!hit) hit = cats.find(c => c.name.toLowerCase() === category.toLowerCase());
  return hit?.id;
}

async function ensureCategoryId(
  category: string,
  subcategory: string,
  autoCreate: boolean,
  rollback: ImportRollbackSnapshot,
): Promise<number | undefined> {
  if (!category) return undefined;
  const existing = await resolveCategoryId(category, subcategory);
  if (existing) return existing;
  if (!autoCreate) return undefined;

  const name = subcategory ? `${category} / ${subcategory}` : category;
  const slug = await ensureUniqueSlug(generateSlugFromName(name));
  const [created] = await db
    .insert(categoriesTable)
    .values({
      name,
      slug,
      metaTitle: `${name} | Khan Dry Fruits`,
      metaDescription: `Shop ${name} — premium dry fruits and nuts at Khan Dry Fruits.`,
      active: true,
    })
    .onConflictDoNothing({ target: categoriesTable.slug })
    .returning({ id: categoriesTable.id });

  if (created) {
    rollback.createdCategoryIds.push(created.id);
    categoryCache = null;
    return created.id;
  }

  return resolveCategoryId(category, subcategory);
}

function buildTags(row: CatalogRow): string[] {
  const tags: string[] = [];
  if (row.brand) tags.push(row.brand);
  if (row.tax) tags.push(`tax:${row.tax}`);
  if (row.subcategory) tags.push(row.subcategory);
  if (row.barcode) tags.push(`barcode:${row.barcode}`);
  return tags;
}

/** Keep last row per SKU when file has duplicates. */
export function dedupeValidRows(valid: RowValidation[]): RowValidation[] {
  const map = new Map<string, RowValidation>();
  for (const v of valid) {
    if (v.data) map.set(v.data.sku.toLowerCase(), v);
  }
  return [...map.values()];
}

async function findEcommerceBySku(sku: string, productName: string) {
  const [bySku] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.externalId, sku))
    .limit(1);
  if (bySku) return bySku;

  const baseSlug = generateSlugFromName(productName);
  const [bySlug] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.slug, baseSlug))
    .limit(1);
  return bySlug ?? null;
}

async function upsertEcommerceProduct(
  row: CatalogRow,
  opts: {
    autoCreateCategories: boolean;
    generateSeo: boolean;
    source: "csv" | "vyapar";
    rollback: ImportRollbackSnapshot;
    skipDuplicates?: boolean;
  },
): Promise<{ id: number; action: "created" | "updated" | "skipped" }> {
  const existing = await findEcommerceBySku(row.sku, row.productName);
  if (existing && opts.skipDuplicates) {
    return { id: existing.id, action: "skipped" };
  }

  const categoryId = await ensureCategoryId(
    row.category,
    row.subcategory,
    opts.autoCreateCategories,
    opts.rollback,
  );
  const baseTags = buildTags(row);
  const seo = opts.generateSeo ? buildProductSeo(row) : null;
  const slug = existing
    ? existing.slug
    : await ensureUniqueSlug(seo?.slug ?? generateSlugFromName(row.productName));
  const tags = opts.generateSeo && seo
    ? tagsWithSeoKeywords(baseTags, seo.focusKeywords)
    : baseTags;
  const variants = row.sku
    ? [{ id: row.sku, name: "Default", value: row.unit, price: String(row.salePrice), stock: row.stock, sku: row.sku }]
    : [];

  const payload = {
    name: row.productName,
    price: String(row.salePrice),
    originalPrice: row.purchasePrice != null ? String(row.purchasePrice) : undefined,
    stock: Math.round(row.stock),
    description: row.description || undefined,
    categoryId,
    images: row.images.length ? row.images : undefined,
    unit: row.unit,
    tags,
    variants,
    active: true,
    source: opts.source,
    externalId: row.sku,
    metaTitle: seo?.metaTitle,
    metaDescription: seo?.metaDescription,
    altText: seo?.altText,
    updatedAt: new Date(),
  };

  if (existing) {
    opts.rollback.updatedEcommerce.push(snapshotEcommerceProduct(existing));
    await db.update(productsTable).set(payload).where(eq(productsTable.id, existing.id));
    return { id: existing.id, action: "updated" };
  }

  const [inserted] = await db
    .insert(productsTable)
    .values({ ...payload, slug, images: row.images })
    .returning({ id: productsTable.id });
  opts.rollback.createdEcommerceIds.push(inserted!.id);
  return { id: inserted!.id, action: "created" };
}

function snapshotEcommerceProduct(p: typeof productsTable.$inferSelect): EcommerceProductSnapshot {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    categoryId: p.categoryId,
    description: p.description,
    price: p.price,
    originalPrice: p.originalPrice,
    stock: p.stock,
    images: (p.images as string[]) ?? [],
    unit: p.unit,
    tags: (p.tags as string[]) ?? [],
    variants: p.variants,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    altText: p.altText,
    active: p.active,
    externalId: p.externalId,
    source: p.source,
  };
}

function snapshotBranchProduct(p: typeof branchProductsTable.$inferSelect): BranchProductSnapshot {
  return {
    id: p.id,
    branchId: p.branchId,
    itemCode: p.itemCode,
    name: p.name,
    unit: p.unit,
    category: p.category,
    purchasePrice: p.purchasePrice,
    salePrice: p.salePrice,
    stockQty: p.stockQty,
    barcode: p.barcode,
    description: p.description,
    imageUrl: p.imageUrl,
    tags: (p.tags as string[]) ?? [],
    isActive: p.isActive,
  };
}

async function upsertBranchProduct(
  row: CatalogRow,
  branchId: number,
  recordMovement: boolean,
  rollback: ImportRollbackSnapshot,
): Promise<"created" | "updated"> {
  const conditions = [
    eq(branchProductsTable.itemCode, row.sku),
    or(eq(branchProductsTable.branchId, branchId), sql`${branchProductsTable.branchId} is null`)!,
  ];

  const [existing] = await db.select().from(branchProductsTable).where(and(...conditions)).limit(1);
  const categoryLabel = row.subcategory ? `${row.category} / ${row.subcategory}` : row.category || null;
  const balBefore = existing ? parseFloat(String(existing.stockQty)) : 0;
  const balAfter = row.stock;

  if (existing) {
    rollback.updatedBranchProducts.push(snapshotBranchProduct(existing));
    await db.update(branchProductsTable).set({
      branchId,
      name: row.productName,
      unit: row.unit,
      category: categoryLabel,
      purchasePrice: row.purchasePrice != null ? String(row.purchasePrice) : existing.purchasePrice,
      salePrice: String(row.salePrice),
      stockQty: String(balAfter),
      lowStockThreshold: String(row.lowStockAlert),
      barcode: row.barcode || existing.barcode,
      description: row.description || existing.description,
      imageUrl: row.images[0] ?? existing.imageUrl,
      isActive: true,
      updatedAt: new Date(),
    }).where(eq(branchProductsTable.id, existing.id));

    if (recordMovement && balAfter !== balBefore) {
      await db.insert(stockMovementsTable).values({
        productId: existing.id,
        branchId,
        type: "adjustment",
        qty: String(Math.abs(balAfter - balBefore)),
        balanceBefore: String(balBefore),
        balanceAfter: String(balAfter),
        referenceType: "bulk_import",
        notes: `Import sync — ${row.productName}`,
      });
    }
    return "updated";
  }

  const [created] = await db.insert(branchProductsTable).values({
    branchId,
    itemCode: row.sku,
    name: row.productName,
    unit: row.unit,
    category: categoryLabel,
    purchasePrice: row.purchasePrice != null ? String(row.purchasePrice) : null,
    salePrice: String(row.salePrice),
    stockQty: String(balAfter),
    lowStockThreshold: String(row.lowStockAlert),
    barcode: row.barcode || null,
    description: row.description || null,
    imageUrl: row.images[0] ?? null,
    tags: buildTags(row),
    isActive: true,
  }).returning({ id: branchProductsTable.id });

  if (recordMovement && balAfter > 0 && created) {
    await db.insert(stockMovementsTable).values({
      productId: created.id,
      branchId,
      type: "in",
      qty: String(balAfter),
      balanceBefore: "0",
      balanceAfter: String(balAfter),
      referenceType: "bulk_import",
      notes: `Initial stock — ${row.productName}`,
    });
  }
  rollback.createdBranchProductIds.push(created!.id);
  return "created";
}

export type SyncOptions = {
  syncEcommerce?: boolean;
  syncBranches?: boolean;
  syncAllBranchesIfEmpty?: boolean;
  recordMovements?: boolean;
  dryRun?: boolean;
  autoCreateCategories?: boolean;
  generateSeo?: boolean;
  vyaparSource?: boolean;
  skipDuplicates?: boolean;
  rollback?: ImportRollbackSnapshot;
};

export const IMPORT_BATCH_SIZE = 75;

/** Import one validated row across e-commerce + branch inventory */
export async function syncCatalogRow(row: CatalogRow, opts: SyncOptions = {}): Promise<ImportRowResult> {
  const {
    syncEcommerce = true,
    syncBranches = true,
    syncAllBranchesIfEmpty = true,
    recordMovements = true,
    dryRun = false,
    autoCreateCategories = true,
    generateSeo = true,
    vyaparSource = false,
    skipDuplicates = false,
    rollback = emptyRollbackSnapshot(),
  } = opts;

  try {
    const branchLabel = row.branch || (syncAllBranchesIfEmpty ? "all" : "");
    const { ids: branchIds, labels } = await resolveBranchIds(branchLabel);

    if (syncBranches && branchIds.length === 0 && branchLabel) {
      return {
        rowNum: row.rowNum,
        ok: false,
        productName: row.productName,
        sku: row.sku,
        branchesUpdated: [],
        error: `Unknown branch "${row.branch}"`,
      };
    }

    if (dryRun) {
      return {
        rowNum: row.rowNum,
        ok: true,
        productName: row.productName,
        sku: row.sku,
        branchesUpdated: labels.length ? labels : ["(e-commerce only)"],
      };
    }

    let action: ImportRowResult["action"] = "updated";

    if (syncEcommerce) {
      const ec = await upsertEcommerceProduct(row, {
        autoCreateCategories,
        generateSeo,
        source: vyaparSource ? "vyapar" : "csv",
        rollback,
        skipDuplicates,
      });
      action = ec.action;
    }

    if (syncBranches) {
      const targets = branchIds.length ? branchIds : [];
      if (targets.length === 0 && syncAllBranchesIfEmpty) {
        const all = await loadBranches();
        for (const b of all) await upsertBranchProduct(row, b.id, recordMovements, rollback);
        return {
          rowNum: row.rowNum,
          ok: true,
          productName: row.productName,
          sku: row.sku,
          branchesUpdated: all.map(b => b.name),
          action,
        };
      }
      for (const bid of targets) await upsertBranchProduct(row, bid, recordMovements, rollback);
    }

    return {
      rowNum: row.rowNum,
      ok: true,
      productName: row.productName,
      sku: row.sku,
      branchesUpdated: labels,
      action,
    };
  } catch (err: unknown) {
    return {
      rowNum: row.rowNum,
      ok: false,
      productName: row.productName,
      sku: row.sku,
      branchesUpdated: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function syncCatalogRows(
  validations: RowValidation[],
  opts: SyncOptions = {},
): Promise<ImportRowResult[]> {
  clearImportCaches();
  const rollback = opts.rollback ?? emptyRollbackSnapshot();
  const mergedOpts = { ...opts, rollback };
  const results: ImportRowResult[] = [];

  for (let i = 0; i < validations.length; i += IMPORT_BATCH_SIZE) {
    const chunk = validations.slice(i, i + IMPORT_BATCH_SIZE);
    for (const v of chunk) {
      if (!v.data) continue;
      results.push(await syncCatalogRow(v.data, mergedOpts));
    }
  }
  return results;
}

export { emptyRollbackSnapshot, type ImportRollbackSnapshot };

/** Export merged catalog for download */
export async function fetchCatalogForExport(): Promise<Record<string, string | number>[]> {
  clearImportCaches();
  const branches = await loadBranches();
  const branchProducts = await db.select().from(branchProductsTable).where(eq(branchProductsTable.isActive, true));
  const ecommerce = await db.select().from(productsTable).orderBy(productsTable.name);

  const rows: Record<string, string | number>[] = [];

  for (const bp of branchProducts) {
    const branch = branches.find(b => b.id === bp.branchId);
    rows.push({
      product_name: bp.name,
      sku: bp.itemCode,
      barcode: bp.barcode ?? "",
      category: (bp.category ?? "").split(" / ")[0] ?? "",
      subcategory: (bp.category ?? "").split(" / ")[1] ?? "",
      purchase_price: bp.purchasePrice ?? "",
      sale_price: bp.salePrice ?? "",
      stock: bp.stockQty,
      unit: bp.unit,
      branch: branch?.name ?? branch?.city ?? "Shared",
      brand: Array.isArray(bp.tags) ? (bp.tags as string[]).find(t => !t.startsWith("tax:")) ?? "" : "",
      description: bp.description ?? "",
      tax: Array.isArray(bp.tags) ? (bp.tags as string[]).find(t => t.startsWith("tax:"))?.replace("tax:", "") ?? "" : "",
      low_stock_alert: bp.lowStockThreshold ?? "",
      images: bp.imageUrl ?? "",
    });
  }

  const branchSkus = new Set(branchProducts.map(p => p.itemCode.toLowerCase()));
  for (const p of ecommerce) {
    const sku = p.externalId ?? p.variants?.[0]?.sku ?? `WEB-${p.id}`;
    if (branchSkus.has(String(sku).toLowerCase())) continue;
    rows.push({
      product_name: p.name,
      sku,
      barcode: "",
      category: "",
      subcategory: "",
      purchase_price: p.originalPrice ?? "",
      sale_price: p.price,
      stock: p.stock,
      unit: p.unit ?? "KG",
      branch: "all",
      brand: (p.tags ?? []).find(t => !t.startsWith("tax:")) ?? "",
      description: p.description ?? "",
      tax: (p.tags ?? []).find(t => t.startsWith("tax:"))?.replace("tax:", "") ?? "",
      low_stock_alert: 1,
      images: (p.images ?? []).join("|"),
    });
  }

  return rows;
}

/** Bulk stock update from rows with sku + stock (+ optional branch) */
export async function bulkUpdateStock(rows: Record<string, string>[]): Promise<ImportRowResult[]> {
  clearImportCaches();
  const results: ImportRowResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = mapRawRow(rows[i]!, i + 2);
    if (!v.valid || !v.data) {
      results.push({ rowNum: i + 2, ok: false, productName: "", sku: "", branchesUpdated: [], error: v.errors.join("; ") });
      continue;
    }
    const row = v.data;
    const { ids, labels } = await resolveBranchIds(row.branch || "all");
    if (!ids.length) {
      results.push({ rowNum: row.rowNum, ok: false, productName: row.productName, sku: row.sku, branchesUpdated: [], error: "No branch matched" });
      continue;
    }
    try {
      for (const bid of ids) await upsertBranchProduct({ ...row, branch: "" }, bid, true, emptyRollbackSnapshot());
      const [p] = await db.select({ id: productsTable.id }).from(productsTable)
        .where(or(eq(productsTable.externalId, row.sku), ilike(productsTable.slug, `%${generateSlugFromName(row.productName)}%`))).limit(1);
      if (p) await db.update(productsTable).set({ stock: Math.round(row.stock), updatedAt: new Date() }).where(eq(productsTable.id, p.id));
      results.push({ rowNum: row.rowNum, ok: true, productName: row.productName, sku: row.sku, branchesUpdated: labels });
    } catch (e: unknown) {
      results.push({ rowNum: row.rowNum, ok: false, productName: row.productName, sku: row.sku, branchesUpdated: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

/** Bulk price update */
export async function bulkUpdatePrices(rows: Record<string, string>[]): Promise<ImportRowResult[]> {
  clearImportCaches();
  const results: ImportRowResult[] = [];
  for (let i = 0; i < rows.length; i++) {
    const v = mapRawRow(rows[i]!, i + 2);
    if (!v.valid || !v.data) {
      results.push({ rowNum: i + 2, ok: false, productName: "", sku: "", branchesUpdated: [], error: v.errors.join("; ") });
      continue;
    }
    const row = v.data;
    const { ids, labels } = await resolveBranchIds(row.branch || "all");
    try {
      if (ids.length) {
        for (const bid of ids) {
          const [bp] = await db.select().from(branchProductsTable)
            .where(and(eq(branchProductsTable.itemCode, row.sku), or(eq(branchProductsTable.branchId, bid), sql`${branchProductsTable.branchId} is null`)!)).limit(1);
          if (bp) {
            await db.update(branchProductsTable).set({
              salePrice: String(row.salePrice),
              purchasePrice: row.purchasePrice != null ? String(row.purchasePrice) : bp.purchasePrice,
              updatedAt: new Date(),
            }).where(eq(branchProductsTable.id, bp.id));
          }
        }
      }
      const [p] = await db.select().from(productsTable)
        .where(or(eq(productsTable.externalId, row.sku), eq(productsTable.slug, generateSlugFromName(row.productName)))).limit(1);
      if (p) {
        await db.update(productsTable).set({
          price: String(row.salePrice),
          originalPrice: row.purchasePrice != null ? String(row.purchasePrice) : p.originalPrice,
          updatedAt: new Date(),
        }).where(eq(productsTable.id, p.id));
      }
      results.push({ rowNum: row.rowNum, ok: true, productName: row.productName, sku: row.sku, branchesUpdated: labels.length ? labels : ["e-commerce"] });
    } catch (e: unknown) {
      results.push({ rowNum: row.rowNum, ok: false, productName: row.productName, sku: row.sku, branchesUpdated: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

/** Generate missing barcodes (EAN-13 style from sku hash) */
export async function ensureBarcodes(skus: string[]): Promise<{ sku: string; barcode: string }[]> {
  const out: { sku: string; barcode: string }[] = [];
  let targets = skus;
  if (!targets.length) {
    const rows = await db.select({ itemCode: branchProductsTable.itemCode }).from(branchProductsTable)
      .where(sql`${branchProductsTable.barcode} is null or ${branchProductsTable.barcode} = ''`)
      .limit(500);
    targets = rows.map(r => r.itemCode);
  }
  for (const sku of targets) {
    const code = sku.replace(/\D/g, "").padStart(12, "0").slice(-12);
    const barcode = `2${code}`.slice(0, 13);
    const [bp] = await db.select().from(branchProductsTable).where(eq(branchProductsTable.itemCode, sku)).limit(1);
    if (bp && !bp.barcode) {
      await db.update(branchProductsTable).set({ barcode, updatedAt: new Date() }).where(eq(branchProductsTable.id, bp.id));
      out.push({ sku, barcode });
    }
  }
  return out;
}
