import { Router } from "express";
import { eq, desc, and, ilike, sql, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  erpPartiesTable, erpPartyLedgerTable, erpPurchasesTable, erpPurchaseLinesTable,
  erpBranchTransfersTable, erpBranchTransferLinesTable, erpPriceSuggestionsTable,
  erpAuditLogsTable, branchesTable, branchProductsTable,
} from "@workspace/db/schema";
import { adminMiddleware } from "../lib/auth";
import { writeErpAudit } from "../lib/erpAudit.js";
import { getProductCostSummary } from "../lib/erpCosting.js";
import { postPurchaseInventory, postTransferReceive, resolveBranchProduct, type PurchaseLineInput } from "../lib/erpInventory.js";

const router = Router();

async function getPartyOutstanding(partyId: number): Promise<number> {
  const rows = await db.select({
    debit: sql<string>`coalesce(sum(debit),0)`,
    credit: sql<string>`coalesce(sum(credit),0)`,
  }).from(erpPartyLedgerTable).where(eq(erpPartyLedgerTable.partyId, partyId));
  const d = parseFloat(rows[0]?.debit ?? "0");
  const c = parseFloat(rows[0]?.credit ?? "0");
  return d - c + 0; // positive = we owe supplier
}

async function addLedgerEntry(opts: {
  partyId: number;
  branchId?: number;
  entryType: string;
  referenceType?: string;
  referenceId?: number;
  debit?: number;
  credit?: number;
  dueDate?: string;
  notes?: string;
  createdBy?: number;
}) {
  const outstanding = await getPartyOutstanding(opts.partyId);
  const delta = (opts.debit ?? 0) - (opts.credit ?? 0);
  const balanceAfter = outstanding + delta;
  await db.insert(erpPartyLedgerTable).values({
    partyId: opts.partyId,
    branchId: opts.branchId,
    entryType: opts.entryType,
    referenceType: opts.referenceType,
    referenceId: opts.referenceId,
    debit: String(opts.debit ?? 0),
    credit: String(opts.credit ?? 0),
    balanceAfter: String(balanceAfter),
    dueDate: opts.dueDate ?? null,
    notes: opts.notes,
    createdBy: opts.createdBy,
  });
  return balanceAfter;
}

/* ─── Parties (Suppliers) ─── */
router.get("/parties", adminMiddleware, async (req, res) => {
  const { q, type = "supplier", page = "1", limit = "50" } = req.query as Record<string, string>;
  const offset = (Math.max(1, parseInt(page)) - 1) * Math.min(100, parseInt(limit));
  const conditions = [eq(erpPartiesTable.isActive, true)];
  if (type) conditions.push(eq(erpPartiesTable.type, type));
  if (q?.trim()) {
    conditions.push(or(
      ilike(erpPartiesTable.name, `%${q}%`),
      ilike(erpPartiesTable.phone, `%${q}%`),
      ilike(erpPartiesTable.code, `%${q}%`),
    )!);
  }
  const parties = await db.select().from(erpPartiesTable).where(and(...conditions))
    .orderBy(erpPartiesTable.name).limit(parseInt(limit)).offset(offset);

  const enriched = await Promise.all(parties.map(async p => {
    const outstanding = await getPartyOutstanding(p.id);
    const [purchaseCount] = await db.select({ c: sql<number>`count(*)::int` })
      .from(erpPurchasesTable).where(eq(erpPurchasesTable.partyId, p.id));
    return { ...p, outstanding, purchaseCount: purchaseCount?.c ?? 0 };
  }));

  res.json({ parties: enriched });
});

router.get("/parties/:id", adminMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const [party] = await db.select().from(erpPartiesTable).where(eq(erpPartiesTable.id, id)).limit(1);
  if (!party) { res.status(404).json({ error: "Not found" }); return; }

  const ledger = await db.select().from(erpPartyLedgerTable)
    .where(eq(erpPartyLedgerTable.partyId, id)).orderBy(desc(erpPartyLedgerTable.createdAt)).limit(100);
  const purchases = await db.select().from(erpPurchasesTable)
    .where(eq(erpPurchasesTable.partyId, id)).orderBy(desc(erpPurchasesTable.purchaseDate)).limit(50);

  res.json({
    party,
    outstanding: await getPartyOutstanding(id),
    ledger,
    purchases,
  });
});

router.post("/parties", adminMiddleware, async (req, res) => {
  const b = req.body;
  const [party] = await db.insert(erpPartiesTable).values({
    type: b.type ?? "supplier",
    name: b.name,
    code: b.code ?? null,
    phone: b.phone,
    email: b.email,
    address: b.address,
    city: b.city,
    creditLimit: b.creditLimit != null ? String(b.creditLimit) : "0",
    openingBalance: b.openingBalance != null ? String(b.openingBalance) : "0",
    paymentTermsDays: b.paymentTermsDays ?? 0,
    taxId: b.taxId,
    notes: b.notes,
    branchId: b.branchId,
  }).returning();

  if (parseFloat(String(b.openingBalance ?? 0)) !== 0) {
    const ob = parseFloat(String(b.openingBalance));
    await addLedgerEntry({
      partyId: party!.id,
      entryType: "opening",
      debit: ob > 0 ? ob : 0,
      credit: ob < 0 ? Math.abs(ob) : 0,
      notes: "Opening balance",
      createdBy: (req as any).user?.adminUserId,
    });
  }

  await writeErpAudit({ req, module: "party", action: "create", resourceType: "party", resourceId: party!.id, newData: party });
  res.status(201).json(party);
});

router.put("/parties/:id", adminMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const b = req.body;
  const [old] = await db.select().from(erpPartiesTable).where(eq(erpPartiesTable.id, id)).limit(1);
  const [party] = await db.update(erpPartiesTable).set({
    name: b.name,
    code: b.code,
    phone: b.phone,
    email: b.email,
    address: b.address,
    city: b.city,
    creditLimit: b.creditLimit != null ? String(b.creditLimit) : undefined,
    paymentTermsDays: b.paymentTermsDays,
    taxId: b.taxId,
    notes: b.notes,
    isActive: b.isActive,
    updatedAt: new Date(),
  }).where(eq(erpPartiesTable.id, id)).returning();
  await writeErpAudit({ req, module: "party", action: "update", resourceType: "party", resourceId: id, oldData: old, newData: party });
  res.json(party);
});

/* ─── Purchases ─── */
router.get("/purchases", adminMiddleware, async (req, res) => {
  const { partyId, branchId, page = "1", limit = "50" } = req.query as Record<string, string>;
  const conditions = [];
  if (partyId) conditions.push(eq(erpPurchasesTable.partyId, parseInt(partyId)));
  if (branchId) conditions.push(eq(erpPurchasesTable.branchId, parseInt(branchId)));
  const where = conditions.length ? and(...conditions) : undefined;
  const purchases = await db.select().from(erpPurchasesTable).where(where)
    .orderBy(desc(erpPurchasesTable.createdAt))
    .limit(parseInt(limit)).offset((parseInt(page) - 1) * parseInt(limit));
  res.json({ purchases });
});

router.post("/purchases", adminMiddleware, async (req, res) => {
  const {
    partyId, branchId, purchaseDate, dueDate, lines = [], taxAmt = 0, otherExpenses = 0,
    paidAmount = 0, notes, paymentStatus, syncEcommerce = true,
  } = req.body as {
    partyId: number; branchId: number; purchaseDate?: string; dueDate?: string;
    lines: PurchaseLineInput[]; taxAmt?: number; otherExpenses?: number;
    paidAmount?: number; notes?: string; paymentStatus?: string; syncEcommerce?: boolean;
  };

  if (!partyId || !branchId || !lines.length) {
    res.status(400).json({ error: "partyId, branchId, and lines required" });
    return;
  }

  const purchaseNo = `PUR-${Date.now()}`;
  let subtotal = 0;
  for (const l of lines) subtotal += l.qty * l.unitCost + (l.taxAmt ?? 0);
  const grandTotal = subtotal + (taxAmt ?? 0) + (otherExpenses ?? 0);

  const [purchase] = await db.insert(erpPurchasesTable).values({
    purchaseNo,
    partyId,
    branchId,
    status: "completed",
    purchaseDate: purchaseDate ?? new Date().toISOString().slice(0, 10),
    dueDate: dueDate ?? null,
    subtotal: String(subtotal),
    taxAmt: String(taxAmt ?? 0),
    otherExpenses: String(otherExpenses ?? 0),
    grandTotal: String(grandTotal),
    paidAmount: String(paidAmount ?? 0),
    paymentStatus: paymentStatus ?? (paidAmount >= grandTotal ? "paid" : paidAmount > 0 ? "partial" : "unpaid"),
    notes,
    createdBy: (req as any).user?.adminUserId,
  }).returning();

  const postedLines = [];
  for (const line of lines) {
    const productId = await resolveBranchProduct(branchId, line);
    const lineTotal = line.qty * line.unitCost + (line.taxAmt ?? 0);
    const [pl] = await db.insert(erpPurchaseLinesTable).values({
      purchaseId: purchase!.id,
      productId,
      itemCode: line.itemCode,
      name: line.name,
      qty: String(line.qty),
      unit: line.unit ?? "KG",
      unitCost: String(line.unitCost),
      lineTotal: String(lineTotal),
      taxAmt: String(line.taxAmt ?? 0),
      batchNo: line.batchNo,
    }).returning();

    await postPurchaseInventory({
      branchId,
      purchaseId: purchase!.id,
      purchaseLineId: pl!.id,
      productId,
      qty: line.qty,
      unitCost: line.unitCost,
      syncEcommerce,
      productName: line.name,
      itemCode: line.itemCode,
      unit: line.unit,
    });
    postedLines.push(pl);
  }

  await addLedgerEntry({
    partyId,
    branchId,
    entryType: "purchase",
    referenceType: "purchase",
    referenceId: purchase!.id,
    debit: grandTotal,
    dueDate: dueDate,
    notes: purchaseNo,
    createdBy: (req as any).user?.adminUserId,
  });

  if (paidAmount > 0) {
    await addLedgerEntry({
      partyId,
      branchId,
      entryType: "payment",
      referenceType: "purchase",
      referenceId: purchase!.id,
      credit: paidAmount,
      notes: `Payment on ${purchaseNo}`,
      createdBy: (req as any).user?.adminUserId,
    });
  }

  await writeErpAudit({
    req, module: "purchase", action: "create", resourceType: "purchase", resourceId: purchase!.id,
    branchId, newData: { purchase, lines: postedLines },
  });

  res.status(201).json({ purchase, lines: postedLines });
});

router.get("/purchases/:id", adminMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const [purchase] = await db.select().from(erpPurchasesTable).where(eq(erpPurchasesTable.id, id)).limit(1);
  if (!purchase) { res.status(404).json({ error: "Not found" }); return; }
  const lines = await db.select().from(erpPurchaseLinesTable).where(eq(erpPurchaseLinesTable.purchaseId, id));
  const [party] = await db.select().from(erpPartiesTable).where(eq(erpPartiesTable.id, purchase.partyId)).limit(1);
  res.json({ purchase, lines, party });
});

/* ─── Party payments ─── */
router.post("/parties/:id/payments", adminMiddleware, async (req, res) => {
  const partyId = parseInt(req.params.id);
  const { amount, branchId, notes } = req.body;
  if (!amount || amount <= 0) { res.status(400).json({ error: "amount required" }); return; }
  const balanceAfter = await addLedgerEntry({
    partyId,
    branchId,
    entryType: "payment",
    credit: amount,
    notes,
    createdBy: (req as any).user?.adminUserId,
  });
  await writeErpAudit({ req, module: "party", action: "payment", resourceType: "party", resourceId: partyId, newData: { amount } });
  res.json({ ok: true, balanceAfter });
});

/* ─── Branch transfers ─── */
router.get("/transfers", adminMiddleware, async (req, res) => {
  const transfers = await db.select().from(erpBranchTransfersTable).orderBy(desc(erpBranchTransfersTable.createdAt)).limit(100);
  res.json({ transfers });
});

router.post("/transfers", adminMiddleware, async (req, res) => {
  const { fromBranchId, toBranchId, lines, notes } = req.body;
  if (!fromBranchId || !toBranchId || !lines?.length) {
    res.status(400).json({ error: "fromBranchId, toBranchId, lines required" });
    return;
  }
  const transferNo = `TR-${Date.now()}`;
  const [transfer] = await db.insert(erpBranchTransfersTable).values({
    transferNo,
    fromBranchId,
    toBranchId,
    status: "pending",
    notes,
    requestedBy: (req as any).user?.adminUserId,
  }).returning();

  for (const line of lines) {
    const [p] = await db.select().from(branchProductsTable).where(eq(branchProductsTable.id, line.productId)).limit(1);
    await db.insert(erpBranchTransferLinesTable).values({
      transferId: transfer!.id,
      productId: line.productId,
      itemCode: p?.itemCode,
      name: p?.name ?? line.name,
      qty: String(line.qty),
      unit: p?.unit,
      unitCost: p?.avgCost ?? p?.purchasePrice ?? "0",
    });
  }

  await writeErpAudit({ req, module: "transfer", action: "create", resourceType: "transfer", resourceId: transfer!.id, newData: transfer });
  res.status(201).json(transfer);
});

router.post("/transfers/:id/approve", adminMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const [t] = await db.update(erpBranchTransfersTable).set({
    status: "approved",
    approvedBy: (req as any).user?.adminUserId,
    updatedAt: new Date(),
  }).where(eq(erpBranchTransfersTable.id, id)).returning();
  await writeErpAudit({ req, module: "transfer", action: "approve", resourceType: "transfer", resourceId: id });
  res.json(t);
});

router.post("/transfers/:id/receive", adminMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const [transfer] = await db.select().from(erpBranchTransfersTable).where(eq(erpBranchTransfersTable.id, id)).limit(1);
  if (!transfer || transfer.status === "received") {
    res.status(400).json({ error: "Invalid transfer" });
    return;
  }
  const lines = await db.select().from(erpBranchTransferLinesTable).where(eq(erpBranchTransferLinesTable.transferId, id));

  for (const line of lines) {
    const qty = parseFloat(String(line.qty));
    const unitCost = parseFloat(String(line.unitCost ?? "0"));
    await postTransferReceive({
      transferId: id,
      lineId: line.id,
      fromBranchId: transfer.fromBranchId,
      toBranchId: transfer.toBranchId,
      productId: line.productId,
      qty,
      unitCost,
    });
    await db.update(erpBranchTransferLinesTable).set({ qtyReceived: line.qty }).where(eq(erpBranchTransferLinesTable.id, line.id));
  }

  const [updated] = await db.update(erpBranchTransfersTable).set({
    status: "received",
    receivedBy: (req as any).user?.adminUserId,
    receivedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(erpBranchTransfersTable.id, id)).returning();

  await writeErpAudit({ req, module: "transfer", action: "receive", resourceType: "transfer", resourceId: id });
  res.json(updated);
});

/* ─── Price suggestions ─── */
router.get("/price-suggestions", adminMiddleware, async (_req, res) => {
  const rows = await db.select({
    suggestion: erpPriceSuggestionsTable,
    productName: branchProductsTable.name,
    itemCode: branchProductsTable.itemCode,
  }).from(erpPriceSuggestionsTable)
    .innerJoin(branchProductsTable, eq(erpPriceSuggestionsTable.productId, branchProductsTable.id))
    .where(eq(erpPriceSuggestionsTable.status, "pending"))
    .orderBy(desc(erpPriceSuggestionsTable.createdAt));
  res.json({ suggestions: rows });
});

router.post("/price-suggestions/:id/approve", adminMiddleware, async (req, res) => {
  const id = parseInt(req.params.id);
  const { salePrice } = req.body;
  const [s] = await db.select().from(erpPriceSuggestionsTable).where(eq(erpPriceSuggestionsTable.id, id)).limit(1);
  if (!s) { res.status(404).json({ error: "Not found" }); return; }
  const price = salePrice ?? s.suggestedSalePrice;
  await db.update(branchProductsTable).set({ salePrice: String(price), updatedAt: new Date() })
    .where(eq(branchProductsTable.id, s.productId));
  const [updated] = await db.update(erpPriceSuggestionsTable).set({
    status: "approved",
    resolvedAt: new Date(),
    resolvedBy: (req as any).user?.adminUserId,
  }).where(eq(erpPriceSuggestionsTable.id, id)).returning();
  await writeErpAudit({ req, module: "pricing", action: "approve_suggestion", resourceId: id, newData: { price } });
  res.json(updated);
});

/* ─── Product cost detail ─── */
router.get("/products/:id/cost", adminMiddleware, async (req, res) => {
  const productId = parseInt(req.params.id);
  const branchId = req.query.branchId ? parseInt(String(req.query.branchId)) : undefined;
  const summary = await getProductCostSummary(productId, branchId);
  res.json(summary);
});

/* ─── Reports ─── */
router.get("/reports/overview", adminMiddleware, async (_req, res) => {
  const [stockVal] = await db.select({
    value: sql<number>`coalesce(sum(stock_qty::numeric * coalesce(avg_cost::numeric, purchase_price::numeric, 0)), 0)`,
    skus: sql<number>`count(*)::int`,
  }).from(branchProductsTable).where(eq(branchProductsTable.isActive, true));

  const [purchasesMonth] = await db.select({
    total: sql<number>`coalesce(sum(grand_total),0)`,
    count: sql<number>`count(*)::int`,
  }).from(erpPurchasesTable).where(sql`purchase_date >= date_trunc('month', current_date)`);

  const [outstanding] = await db.select({
    total: sql<number>`coalesce(sum(debit - credit),0)`,
  }).from(erpPartyLedgerTable);

  const lowStock = await db.select().from(branchProductsTable)
    .where(sql`stock_qty::numeric <= coalesce(low_stock_threshold::numeric, 1) and is_active = true`)
    .limit(20);

  res.json({
    stockValuation: stockVal?.value ?? 0,
    activeSkus: stockVal?.skus ?? 0,
    purchasesThisMonth: purchasesMonth?.total ?? 0,
    purchaseCountMonth: purchasesMonth?.count ?? 0,
    supplierOutstanding: outstanding?.total ?? 0,
    lowStock,
  });
});

router.get("/reports/supplier-ledger", adminMiddleware, async (req, res) => {
  const { partyId } = req.query;
  if (!partyId) { res.status(400).json({ error: "partyId required" }); return; }
  const ledger = await db.select().from(erpPartyLedgerTable)
    .where(eq(erpPartyLedgerTable.partyId, parseInt(String(partyId))))
    .orderBy(desc(erpPartyLedgerTable.createdAt));
  res.json({ ledger, outstanding: await getPartyOutstanding(parseInt(String(partyId))) });
});

router.get("/reports/stock-valuation", adminMiddleware, async (_req, res) => {
  const rows = await db.select({
    id: branchProductsTable.id,
    name: branchProductsTable.name,
    itemCode: branchProductsTable.itemCode,
    branchId: branchProductsTable.branchId,
    stockQty: branchProductsTable.stockQty,
    avgCost: branchProductsTable.avgCost,
    purchasePrice: branchProductsTable.purchasePrice,
    salePrice: branchProductsTable.salePrice,
    value: sql<number>`stock_qty::numeric * coalesce(avg_cost::numeric, purchase_price::numeric, 0)`,
  }).from(branchProductsTable).where(eq(branchProductsTable.isActive, true)).orderBy(branchProductsTable.name);
  res.json({ rows, total: rows.reduce((s, r) => s + Number(r.value ?? 0), 0) });
});

router.get("/audit-logs", adminMiddleware, async (req, res) => {
  const { module, limit = "100" } = req.query as Record<string, string>;
  const conditions = [];
  if (module) conditions.push(eq(erpAuditLogsTable.module, module));
  const logs = await db.select().from(erpAuditLogsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(erpAuditLogsTable.createdAt))
    .limit(parseInt(limit));
  res.json({ logs });
});

export default router;
