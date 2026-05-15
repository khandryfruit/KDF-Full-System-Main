import { Readable } from "stream";
import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { db, productsTable, syncJobsTable } from "@workspace/db";
import { adminMiddleware } from "../lib/auth";
import { eq } from "drizzle-orm";
import { generateSlugFromName } from "../lib/slugify";
import {
  CATALOG_COLUMNS,
  validateRows,
  syncCatalogRows,
  fetchCatalogForExport,
  bulkUpdateStock,
  bulkUpdatePrices,
  ensureBarcodes,
  clearImportCaches,
} from "../lib/unifiedProductImport.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const EXAMPLE_ROW: Record<string, string> = {
  product_name: "Premium Almonds",
  sku: "ALM001",
  barcode: "1234567890123",
  category: "Dry Fruits",
  subcategory: "",
  purchase_price: "1800",
  sale_price: "2200",
  stock: "50",
  unit: "KG",
  branch: "Lahore",
  brand: "KDF",
  description: "Premium quality almonds",
  tax: "0",
  low_stock_alert: "5",
  images: "",
};

export async function parseWorksheet(
  buffer: Buffer,
  filename: string
): Promise<{ worksheet: ExcelJS.Worksheet; sheetName: string }> {
  const workbook = new ExcelJS.Workbook();
  const ext = filename.toLowerCase();

  if (ext.endsWith(".csv")) {
    const worksheet = await workbook.csv.read(Readable.from(buffer));
    return { worksheet, sheetName: "Sheet1" };
  }

  await workbook.xlsx.read(Readable.from(buffer));
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("No worksheet found in file");
  return { worksheet, sheetName: worksheet.name };
}

export function worksheetToRows(worksheet: ExcelJS.Worksheet): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const headers: string[] = [];

  worksheet.eachRow((row, rowNum) => {
    if (rowNum === 1) {
      row.eachCell((cell, colNum) => {
        headers[colNum - 1] = String(cell.value ?? "").trim();
      });
      return;
    }
    const obj: Record<string, string> = {};
    row.eachCell((cell, colNum) => {
      const header = headers[colNum - 1];
      if (header) obj[header] = String(cell.value ?? "").trim();
    });
    if (Object.values(obj).some(v => v)) rows.push(obj);
  });

  return rows;
}

async function buildWorkbookFromCatalog(format: string) {
  const rows = await fetchCatalogForExport();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Catalog");
  worksheet.columns = CATALOG_COLUMNS.map(h => ({ header: h, key: h, width: 16 }));
  for (const r of rows) worksheet.addRow(r);
  worksheet.addRow({});
  const note = worksheet.addRow({ product_name: "— Example row (delete before import) —" });
  note.font = { italic: true, color: { argb: "FF888888" } };
  worksheet.addRow(EXAMPLE_ROW);
  return { workbook, rows };
}

function sendWorkbook(res: import("express").Response, workbook: ExcelJS.Workbook, format: string, basename: string) {
  if (format === "xlsx") {
    return workbook.xlsx.writeBuffer().then(buf => {
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${basename}-${Date.now()}.xlsx"`);
      res.send(Buffer.from(buf));
    });
  }
  return workbook.csv.writeBuffer().then(buf => {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${basename}-${Date.now()}.csv"`);
    res.send(Buffer.from(buf));
  });
}

/* ─── Template download ─── */
router.get("/admin/import/catalog/template", adminMiddleware as any, async (req, res) => {
  try {
    const { format = "csv" } = req.query as { format?: string };
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Catalog Template");
    ws.columns = CATALOG_COLUMNS.map(h => ({ header: h, key: h, width: 18 }));
    ws.addRow(EXAMPLE_ROW);
    ws.getRow(1).font = { bold: true };
    await sendWorkbook(res, workbook, format, "kdf-catalog-template");
  } catch (err: unknown) {
    req.log.error(err);
    res.status(500).json({ error: "Template generation failed" });
  }
});

/* ─── Preview (validate without commit) ─── */
router.post("/admin/import/catalog/preview", adminMiddleware as any, upload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  try {
    const { worksheet } = await parseWorksheet(req.file.buffer, req.file.originalname);
    const rawRows = worksheetToRows(worksheet);
    const { valid, invalid } = validateRows(rawRows);
    const dryResults = await syncCatalogRows(valid, { dryRun: true });
    res.json({
      totalRows: rawRows.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      preview: valid.slice(0, 50).map(v => ({
        rowNum: v.rowNum,
        productName: v.data!.productName,
        sku: v.data!.sku,
        salePrice: v.data!.salePrice,
        stock: v.data!.stock,
        branch: v.data!.branch || "all branches",
        unit: v.data!.unit,
      })),
      invalid: invalid.map(v => ({ rowNum: v.rowNum, errors: v.errors })),
      dryRun: dryResults.slice(0, 20),
    });
  } catch (err: unknown) {
    req.log.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Preview failed" });
  } finally {
    clearImportCaches();
  }
});

/* ─── Unified catalog import (POS + e-commerce + branches) ─── */
router.post("/admin/import/catalog", adminMiddleware as any, upload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const [job] = await db.insert(syncJobsTable).values({
    integrationType: "catalog_import",
    status: "running",
    logs: [`Catalog import: ${req.file.originalname}`],
    meta: { filename: req.file.originalname },
  }).returning();

  try {
    const { worksheet, sheetName } = await parseWorksheet(req.file.buffer, req.file.originalname);
    const rawRows = worksheetToRows(worksheet);
    const { valid, invalid } = validateRows(rawRows);
    const results = await syncCatalogRows(valid, {
      syncEcommerce: true,
      syncBranches: true,
      recordMovements: true,
    });

    const successCount = results.filter(r => r.ok).length;
    const failedCount = invalid.length + results.filter(r => !r.ok).length;
    const errors = [
      ...invalid.map(v => `Row ${v.rowNum}: ${v.errors.join(", ")}`),
      ...results.filter(r => !r.ok).map(r => `Row ${r.rowNum} (${r.productName}): ${r.error}`),
    ];

    await db.update(syncJobsTable).set({
      status: failedCount === rawRows.length ? "failed" : "completed",
      logs: [`Sheet "${sheetName}": ${successCount} ok, ${failedCount} failed`, ...errors.slice(0, 100)],
      totalItems: rawRows.length,
      successCount,
      failedCount,
      completedAt: new Date(),
    }).where(eq(syncJobsTable.id, job!.id));

    res.json({
      jobId: job!.id,
      totalItems: rawRows.length,
      successCount,
      failedCount,
      errors: errors.slice(0, 200),
      results: results.slice(0, 500),
    });
  } catch (err: unknown) {
    req.log.error(err);
    await db.update(syncJobsTable).set({
      status: "failed",
      logs: [err instanceof Error ? err.message : String(err)],
      completedAt: new Date(),
    }).where(eq(syncJobsTable.id, job!.id));
    res.status(500).json({ error: "Import failed" });
  } finally {
    clearImportCaches();
  }
});

/* ─── Export unified catalog ─── */
router.get("/admin/export/catalog", adminMiddleware as any, async (req, res) => {
  try {
    const { format = "csv" } = req.query as { format?: string };
    const { workbook } = await buildWorkbookFromCatalog(format);
    await sendWorkbook(res, workbook, format, "kdf-catalog");
  } catch (err: unknown) {
    req.log.error(err);
    res.status(500).json({ error: "Export failed" });
  } finally {
    clearImportCaches();
  }
});

/* ─── Bulk stock update ─── */
router.post("/admin/import/bulk-stock", adminMiddleware as any, upload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  try {
    const { worksheet } = await parseWorksheet(req.file.buffer, req.file.originalname);
    const rawRows = worksheetToRows(worksheet);
    const results = await bulkUpdateStock(rawRows);
    const successCount = results.filter(r => r.ok).length;
    res.json({
      totalItems: rawRows.length,
      successCount,
      failedCount: results.length - successCount,
      errors: results.filter(r => !r.ok).map(r => `Row ${r.rowNum}: ${r.error}`),
      results,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Bulk stock update failed" });
  } finally {
    clearImportCaches();
  }
});

/* ─── Bulk price update ─── */
router.post("/admin/import/bulk-price", adminMiddleware as any, upload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  try {
    const { worksheet } = await parseWorksheet(req.file.buffer, req.file.originalname);
    const rawRows = worksheetToRows(worksheet);
    const results = await bulkUpdatePrices(rawRows);
    const successCount = results.filter(r => r.ok).length;
    res.json({
      totalItems: rawRows.length,
      successCount,
      failedCount: results.length - successCount,
      errors: results.filter(r => !r.ok).map(r => `Row ${r.rowNum}: ${r.error}`),
      results,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Bulk price update failed" });
  } finally {
    clearImportCaches();
  }
});

/* ─── Generate barcodes for SKUs without barcode ─── */
router.post("/admin/import/generate-barcodes", adminMiddleware as any, async (req, res) => {
  const { skus } = req.body as { skus?: string[] };
  if (!skus?.length) {
    const all = await db.select({ sku: productsTable.externalId }).from(productsTable).limit(500);
    const fromDb = all.map(a => a.sku).filter(Boolean) as string[];
    const generated = await ensureBarcodes(fromDb);
    res.json({ generated, count: generated.length });
    return;
  }
  const generated = await ensureBarcodes(skus);
  res.json({ generated, count: generated.length });
});

/* ─── Legacy e-commerce-only import (backward compatible) ─── */
router.post("/admin/import/products", adminMiddleware as any, upload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  const [job] = await db.insert(syncJobsTable).values({
    integrationType: "csv_import",
    status: "running",
    logs: [`Import started: ${req.file.originalname}`],
    meta: { filename: req.file.originalname },
  }).returning();

  try {
    const { worksheet, sheetName } = await parseWorksheet(req.file.buffer, req.file.originalname);
    const rows = worksheetToRows(worksheet);

    const hasCatalogHeaders = rows[0] && (
      "product_name" in rows[0] || "Product Name" in rows[0] || "sku" in rows[0] || "SKU" in rows[0]
    );

    if (hasCatalogHeaders) {
      const { valid, invalid } = validateRows(rows);
      const results = await syncCatalogRows(valid, { syncEcommerce: true, syncBranches: true });
      const successCount = results.filter(r => r.ok).length;
      const failedCount = invalid.length + results.filter(r => !r.ok).length;
      const errors = [
        ...invalid.map(v => `Row ${v.rowNum}: ${v.errors.join(", ")}`),
        ...results.filter(r => !r.ok).map(r => `Row ${r.rowNum}: ${r.error}`),
      ];
      await db.update(syncJobsTable).set({
        status: "completed",
        logs: [`Unified import from ${sheetName}`, ...errors],
        totalItems: rows.length,
        successCount,
        failedCount,
        completedAt: new Date(),
      }).where(eq(syncJobsTable.id, job!.id));
      res.json({ jobId: job!.id, totalItems: rows.length, successCount, failedCount, errors });
      return;
    }

    const logs: string[] = [`Parsed ${rows.length} rows`];
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const name = (row["name"] || row["Name"] || "").trim();
      const priceRaw = row["price"] ?? row["Price"] ?? "";
      const price = parseFloat(priceRaw);
      if (!name) { failedCount++; errors.push(`Row ${i + 2}: missing name`); continue; }
      if (isNaN(price) || price <= 0) { failedCount++; errors.push(`Row ${i + 2}: invalid price`); continue; }
      try {
        const slug = (row["slug"] ?? "").trim() || generateSlugFromName(name);
        await db.insert(productsTable).values({
          name, slug, price: String(price), stock: parseInt(row["stock"] ?? "0") || 0,
          active: true, source: "csv",
        }).onConflictDoUpdate({
          target: productsTable.slug,
          set: { name, price: String(price), updatedAt: new Date() },
        });
        successCount++;
      } catch (err: unknown) {
        failedCount++;
        errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await db.update(syncJobsTable).set({
      status: "completed", logs: [...logs, ...errors], totalItems: rows.length,
      successCount, failedCount, completedAt: new Date(),
    }).where(eq(syncJobsTable.id, job!.id));
    res.json({ jobId: job!.id, totalItems: rows.length, successCount, failedCount, errors });
  } catch (err: unknown) {
    req.log.error(err);
    res.status(500).json({ error: "Import failed" });
  } finally {
    clearImportCaches();
  }
});

router.get("/admin/export/products", adminMiddleware as any, async (req, res) => {
  const { format = "csv", unified } = req.query as { format?: string; unified?: string };
  if (unified === "1" || unified === "true") {
    try {
      const { workbook } = await buildWorkbookFromCatalog(format);
      await sendWorkbook(res, workbook, format, "products");
    } catch {
      res.status(500).json({ error: "Export failed" });
    }
    return;
  }

  try {
    const products = await db.select().from(productsTable);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Products");
    worksheet.columns = [
      { header: "name", key: "name" }, { header: "price", key: "price" },
      { header: "stock", key: "stock" }, { header: "description", key: "description" },
    ];
    for (const p of products) {
      worksheet.addRow({ name: p.name, price: p.price, stock: p.stock, description: p.description ?? "" });
    }
    await sendWorkbook(res, workbook, format, "products");
  } catch (err: unknown) {
    req.log.error(err);
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
