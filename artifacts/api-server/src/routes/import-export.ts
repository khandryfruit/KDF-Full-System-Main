import { Readable } from "stream";
import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { db, productsTable, syncJobsTable } from "@workspace/db";
import { adminMiddleware } from "../lib/auth";
import { eq, desc } from "drizzle-orm";
import { generateSlugFromName } from "../lib/slugify";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function parseWorksheet(
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

function worksheetToRows(worksheet: ExcelJS.Worksheet): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const headers: string[] = [];

  worksheet.eachRow((row, rowNum) => {
    if (rowNum === 1) {
      row.eachCell((cell, colNum) => {
        headers[colNum - 1] = String(cell.value ?? "");
      });
      return;
    }
    const obj: Record<string, string> = {};
    row.eachCell((cell, colNum) => {
      const header = headers[colNum - 1];
      if (header) obj[header] = String(cell.value ?? "");
    });
    rows.push(obj);
  });

  return rows;
}

router.post("/admin/import/products", adminMiddleware as any, upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const [job] = await db.insert(syncJobsTable).values({
    integrationType: "csv_import",
    status: "running",
    logs: [`Import started: ${req.file.originalname} (${req.file.size} bytes)`],
    meta: { filename: req.file.originalname, mimetype: req.file.mimetype },
  }).returning();

  try {
    const { worksheet, sheetName } = await parseWorksheet(req.file.buffer, req.file.originalname);
    const rows = worksheetToRows(worksheet);

    const logs: string[] = [`Parsed ${rows.length} rows from sheet "${sheetName}"`];
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const name = (row["name"] || row["Name"] || row["title"] || row["Title"] || "").trim();
      const priceRaw = row["price"] ?? row["Price"] ?? row["selling_price"] ?? "";
      const price = parseFloat(priceRaw);

      if (!name) {
        failedCount++;
        errors.push(`Row ${i + 2}: missing name`);
        continue;
      }
      if (isNaN(price) || price <= 0) {
        failedCount++;
        errors.push(`Row ${i + 2}: invalid price "${priceRaw}"`);
        continue;
      }

      try {
        const stock = parseInt(row["stock"] ?? row["Stock"] ?? row["quantity"] ?? "0") || 0;
        const originalPrice = parseFloat(row["original_price"] ?? row["originalPrice"] ?? row["compare_price"] ?? "") || undefined;
        const description = (row["description"] ?? row["Description"] ?? "").trim() || undefined;
        const slugRaw = (row["slug"] ?? row["Slug"] ?? "").trim();
        const slug = slugRaw || generateSlugFromName(name);
        const externalIdRaw = row["external_id"] ?? row["externalId"] ?? row["id"];
        const externalId = externalIdRaw != null ? String(externalIdRaw).trim() || undefined : undefined;

        let variants: any[] = [];
        if (row["variants"]) {
          try { variants = JSON.parse(row["variants"]); } catch {}
        }

        let images: string[] = [];
        const imgRaw = (row["images"] ?? row["image"] ?? row["image_url"] ?? "").trim();
        if (imgRaw) images = imgRaw.split("|").map((s: string) => s.trim()).filter(Boolean);

        await db.insert(productsTable).values({
          name,
          slug,
          price: String(price),
          originalPrice: originalPrice ? String(originalPrice) : undefined,
          stock,
          description,
          images,
          variants,
          active: true,
          source: "csv",
          externalId,
        }).onConflictDoUpdate({
          target: productsTable.slug,
          set: {
            name,
            price: String(price),
            originalPrice: originalPrice ? String(originalPrice) : undefined,
            stock,
            description,
            images,
            variants,
            source: "csv",
            externalId,
            updatedAt: new Date(),
          },
        });
        successCount++;
      } catch (err: unknown) {
        failedCount++;
        errors.push(`Row ${i + 2} (${name}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const finalLogs = [...logs, ...errors, `Done: ${successCount} imported, ${failedCount} failed`];
    await db.update(syncJobsTable).set({
      status: failedCount === rows.length ? "failed" : "completed",
      logs: finalLogs,
      totalItems: rows.length,
      successCount,
      failedCount,
      completedAt: new Date(),
    }).where(eq(syncJobsTable.id, job.id));

    res.json({ jobId: job.id, totalItems: rows.length, successCount, failedCount, errors });
  } catch (err: unknown) {
    req.log.error(err);
    await db.update(syncJobsTable).set({
      status: "failed",
      logs: [`Fatal error: ${err instanceof Error ? err.message : String(err)}`],
      completedAt: new Date(),
    }).where(eq(syncJobsTable.id, job.id));
    res.status(500).json({ error: "Import failed: " + (err instanceof Error ? err.message : String(err)) });
  }
});

router.get("/admin/export/products", adminMiddleware as any, async (req, res) => {
  try {
    const { format = "csv" } = req.query;
    const products = await db.select().from(productsTable).orderBy(desc(productsTable.createdAt));

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Products");

    worksheet.columns = [
      { header: "id", key: "id" },
      { header: "name", key: "name" },
      { header: "slug", key: "slug" },
      { header: "description", key: "description" },
      { header: "price", key: "price" },
      { header: "original_price", key: "original_price" },
      { header: "stock", key: "stock" },
      { header: "category_id", key: "category_id" },
      { header: "images", key: "images" },
      { header: "variants", key: "variants" },
      { header: "tags", key: "tags" },
      { header: "weight", key: "weight" },
      { header: "unit", key: "unit" },
      { header: "featured", key: "featured" },
      { header: "active", key: "active" },
      { header: "rating", key: "rating" },
      { header: "review_count", key: "review_count" },
      { header: "created_at", key: "created_at" },
    ];

    for (const p of products) {
      worksheet.addRow({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description ?? "",
        price: p.price,
        original_price: p.originalPrice ?? "",
        stock: p.stock,
        category_id: p.categoryId ?? "",
        images: (p.images ?? []).join("|"),
        variants: p.variants ? JSON.stringify(p.variants) : "",
        tags: (p.tags ?? []).join(","),
        weight: p.weight ?? "",
        unit: p.unit ?? "",
        featured: p.featured ? "true" : "false",
        active: p.active ? "true" : "false",
        rating: p.rating ?? "",
        review_count: p.reviewCount,
        created_at: p.createdAt.toISOString(),
      });
    }

    if (format === "xlsx") {
      const buf = await workbook.xlsx.writeBuffer();
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="products-${Date.now()}.xlsx"`);
      res.send(Buffer.from(buf));
    } else {
      const buf = await workbook.csv.writeBuffer();
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="products-${Date.now()}.csv"`);
      res.send(Buffer.from(buf));
    }
  } catch (err: unknown) {
    req.log.error(err);
    res.status(500).json({ error: "Export failed" });
  }
});

export default router;
