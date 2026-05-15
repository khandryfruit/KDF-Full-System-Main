import { and, desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { branchesTable } from "@workspace/db/schema";

export function moneyField(value: unknown): string {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? 0));
  if (!Number.isFinite(n)) return "0.00";
  return Math.max(0, n).toFixed(2);
}

export function sanitizeInvoiceItems(items: unknown): Record<string, unknown>[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw) => {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const qty = typeof row.qty === "number" ? row.qty : parseFloat(String(row.qty ?? 0));
    const price =
      typeof row.pricePerUnit === "number"
        ? row.pricePerUnit
        : parseFloat(String(row.pricePerUnit ?? row.price ?? 0));
    const lineTotal =
      typeof row.lineTotal === "number"
        ? row.lineTotal
        : parseFloat(String(row.lineTotal ?? row.total ?? 0));
    const discount =
      typeof row.discount === "number" ? row.discount : parseFloat(String(row.discount ?? 0));
    return {
      name: String(row.name ?? "Item"),
      sku: row.sku != null ? String(row.sku) : undefined,
      qty: Number.isFinite(qty) ? qty : 0,
      unit: row.unit != null ? String(row.unit) : "pcs",
      pricePerUnit: Number.isFinite(price) ? price : 0,
      discount: Number.isFinite(discount) ? discount : 0,
      lineTotal: Number.isFinite(lineTotal) ? lineTotal : 0,
    };
  });
}

/** Pick a valid branch: requested id → head office → any active → any row. */
export async function resolveAdminBranchId(requested?: unknown): Promise<number> {
  const parsed = parseInt(String(requested ?? ""), 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    const [match] = await db
      .select({ id: branchesTable.id })
      .from(branchesTable)
      .where(and(eq(branchesTable.id, parsed), eq(branchesTable.isActive, true)))
      .limit(1);
    if (match) return match.id;
  }

  const [head] = await db
    .select({ id: branchesTable.id })
    .from(branchesTable)
    .where(eq(branchesTable.isActive, true))
    .orderBy(desc(branchesTable.isHeadOffice), branchesTable.name)
    .limit(1);
  if (head) return head.id;

  const [any] = await db.select({ id: branchesTable.id }).from(branchesTable).limit(1);
  if (!any) {
    throw new Error("No branch configured. Create a branch in Admin → Branches first.");
  }
  return any.id;
}

export function pgErrorMessage(err: unknown): { message: string; detail?: string; code?: string } {
  const e = err as { message?: string; detail?: string; code?: string };
  const code = e?.code;
  let message = e?.message ?? "Failed to save invoice";
  if (code === "23503") {
    message = "Invalid branch or related record. Check that at least one branch exists.";
  } else if (code === "23505") {
    message = "Duplicate invoice number. Try saving again.";
  }
  return { message, detail: e?.detail, code };
}
