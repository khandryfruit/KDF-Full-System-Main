import { db, productsTable, categoriesTable, branchesTable, branchProductsTable, stockMovementsTable } from "@workspace/db";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { generateSlugFromName } from "./slugify.js";

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
  error?: string;
};

const HEADER_ALIASES: Record<string, keyof CatalogRow | "raw"> = {
  product_name: "productName", name: "productName", "product name": "productName", title: "productName",
  sku: "sku", item_code: "sku", "item code": "sku", code: "sku",
  barcode: "barcode", upc: "barcode", ean: "barcode",
  category: "category", cat: "category",
  subcategory: "subcategory", "sub category": "subcategory", sub_category: "subcategory",
  purchase_price: "purchasePrice", "purchase price": "purchasePrice", cost: "purchasePrice", buy_price: "purchasePrice",
  sale_price: "salePrice", price: "salePrice", "sale price": "salePrice", selling_price: "salePrice",
  stock: "stock", quantity: "stock", stock_qty: "stock", qty: "stock",
  unit: "unit", uom: "unit",
  branch: "branch", branch_name: "branch", location: "branch",
  brand: "brand", manufacturer: "brand",
  description: "description", desc: "description",
  tax: "tax", vat: "tax", gst: "tax",
  low_stock_alert: "lowStockAlert", low_stock: "lowStockAlert", "low stock": "lowStockAlert", reorder_level: "lowStockAlert",
  images: "images", image: "images", image_url: "images", photos: "images",
};

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

function buildTags(row: CatalogRow): string[] {
  const tags: string[] = [];
  if (row.brand) tags.push(row.brand);
  if (row.tax) tags.push(`tax:${row.tax}`);
  if (row.subcategory) tags.push(row.subcategory);
  return tags;
}

async function upsertEcommerceProduct(row: CatalogRow): Promise<number> {
  const slug = generateSlugFromName(row.productName);
  const categoryId = await resolveCategoryId(row.category, row.subcategory);
  const tags = buildTags(row);
  const variants = row.sku
    ? [{ id: row.sku, name: "Default", value: row.unit, price: String(row.salePrice), stock: row.stock, sku: row.sku }]
    : [];

  const [existing] = await db.select({ id: productsTable.id }).from(productsTable)
    .where(or(eq(productsTable.slug, slug), eq(productsTable.externalId, row.sku))).limit(1);

  if (existing) {
    await db.update(productsTable).set({
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
      source: "csv",
      externalId: row.sku,
      updatedAt: new Date(),
    }).where(eq(productsTable.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db.insert(productsTable).values({
    name: row.productName,
    slug,
    price: String(row.salePrice),
    originalPrice: row.purchasePrice != null ? String(row.purchasePrice) : undefined,
    stock: Math.round(row.stock),
    description: row.description || undefined,
    categoryId,
    images: row.images,
    unit: row.unit,
    tags,
    variants,
    active: true,
    source: "csv",
    externalId: row.sku,
  }).returning({ id: productsTable.id });
  return inserted!.id;
}

async function upsertBranchProduct(
  row: CatalogRow,
  branchId: number,
  recordMovement: boolean,
): Promise<void> {
  const conditions = [
    eq(branchProductsTable.itemCode, row.sku),
    or(eq(branchProductsTable.branchId, branchId), sql`${branchProductsTable.branchId} is null`)!,
  ];

  const [existing] = await db.select().from(branchProductsTable).where(and(...conditions)).limit(1);
  const categoryLabel = row.subcategory ? `${row.category} / ${row.subcategory}` : row.category || null;
  const balBefore = existing ? parseFloat(String(existing.stockQty)) : 0;
  const balAfter = row.stock;

  if (existing) {
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
    return;
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
}

export type SyncOptions = {
  syncEcommerce?: boolean;
  syncBranches?: boolean;
  syncAllBranchesIfEmpty?: boolean;
  recordMovements?: boolean;
  dryRun?: boolean;
};

/** Import one validated row across e-commerce + branch inventory */
export async function syncCatalogRow(row: CatalogRow, opts: SyncOptions = {}): Promise<ImportRowResult> {
  const {
    syncEcommerce = true,
    syncBranches = true,
    syncAllBranchesIfEmpty = true,
    recordMovements = true,
    dryRun = false,
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

    if (syncEcommerce) await upsertEcommerceProduct(row);

    if (syncBranches) {
      const targets = branchIds.length ? branchIds : [];
      if (targets.length === 0 && syncAllBranchesIfEmpty) {
        const all = await loadBranches();
        for (const b of all) await upsertBranchProduct(row, b.id, recordMovements);
        return {
          rowNum: row.rowNum,
          ok: true,
          productName: row.productName,
          sku: row.sku,
          branchesUpdated: all.map(b => b.name),
        };
      }
      for (const bid of targets) await upsertBranchProduct(row, bid, recordMovements);
    }

    return {
      rowNum: row.rowNum,
      ok: true,
      productName: row.productName,
      sku: row.sku,
      branchesUpdated: labels,
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
  const results: ImportRowResult[] = [];
  for (const v of validations) {
    if (!v.data) continue;
    results.push(await syncCatalogRow(v.data, opts));
  }
  return results;
}

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
      for (const bid of ids) await upsertBranchProduct({ ...row, branch: "" }, bid, true);
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
