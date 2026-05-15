import { db, productsTable, branchProductsTable, categoriesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger.js";

export type EcommerceProductSnapshot = {
  id: number;
  name: string;
  slug: string;
  categoryId: number | null;
  description: string | null;
  price: string;
  originalPrice: string | null;
  stock: number;
  images: string[] | null;
  unit: string | null;
  tags: string[] | null;
  variants: unknown;
  metaTitle: string | null;
  metaDescription: string | null;
  altText: string | null;
  active: boolean;
  externalId: string | null;
  source: string | null;
};

export type BranchProductSnapshot = {
  id: number;
  branchId: number | null;
  itemCode: string;
  name: string;
  unit: string;
  category: string | null;
  purchasePrice: string | null;
  salePrice: string | null;
  stockQty: string;
  barcode: string | null;
  description: string | null;
  imageUrl: string | null;
  tags: string[] | null;
  isActive: boolean;
};

export type ImportRollbackSnapshot = {
  version: 1;
  createdAt: string;
  createdEcommerceIds: number[];
  createdBranchProductIds: number[];
  createdCategoryIds: number[];
  updatedEcommerce: EcommerceProductSnapshot[];
  updatedBranchProducts: BranchProductSnapshot[];
};

export function emptyRollbackSnapshot(): ImportRollbackSnapshot {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    createdEcommerceIds: [],
    createdBranchProductIds: [],
    createdCategoryIds: [],
    updatedEcommerce: [],
    updatedBranchProducts: [],
  };
}

export async function rollbackImport(snapshot: ImportRollbackSnapshot): Promise<{
  deletedEcommerce: number;
  deletedBranch: number;
  restoredEcommerce: number;
  restoredBranch: number;
  deletedCategories: number;
}> {
  let deletedEcommerce = 0;
  let deletedBranch = 0;
  let restoredEcommerce = 0;
  let restoredBranch = 0;
  let deletedCategories = 0;

  for (const before of snapshot.updatedEcommerce) {
    await db
      .update(productsTable)
      .set({
        name: before.name,
        slug: before.slug,
        categoryId: before.categoryId,
        description: before.description,
        price: before.price,
        originalPrice: before.originalPrice,
        stock: before.stock,
        images: before.images ?? [],
        unit: before.unit,
        tags: before.tags ?? [],
        variants: before.variants as never,
        metaTitle: before.metaTitle,
        metaDescription: before.metaDescription,
        altText: before.altText,
        active: before.active,
        externalId: before.externalId,
        source: before.source as never,
        updatedAt: new Date(),
      })
      .where(eq(productsTable.id, before.id));
    restoredEcommerce++;
  }

  for (const before of snapshot.updatedBranchProducts) {
    await db
      .update(branchProductsTable)
      .set({
        branchId: before.branchId,
        itemCode: before.itemCode,
        name: before.name,
        unit: before.unit,
        category: before.category,
        purchasePrice: before.purchasePrice,
        salePrice: before.salePrice,
        stockQty: before.stockQty,
        barcode: before.barcode,
        description: before.description,
        imageUrl: before.imageUrl,
        tags: before.tags ?? [],
        isActive: before.isActive,
        updatedAt: new Date(),
      })
      .where(eq(branchProductsTable.id, before.id));
    restoredBranch++;
  }

  if (snapshot.createdEcommerceIds.length) {
    const r = await db
      .delete(productsTable)
      .where(inArray(productsTable.id, snapshot.createdEcommerceIds))
      .returning({ id: productsTable.id });
    deletedEcommerce = r.length;
  }

  if (snapshot.createdBranchProductIds.length) {
    const r = await db
      .delete(branchProductsTable)
      .where(inArray(branchProductsTable.id, snapshot.createdBranchProductIds))
      .returning({ id: branchProductsTable.id });
    deletedBranch = r.length;
  }

  if (snapshot.createdCategoryIds.length) {
    for (const catId of snapshot.createdCategoryIds) {
      const used = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(eq(productsTable.categoryId, catId))
        .limit(1);
      if (!used.length) {
        await db.delete(categoriesTable).where(eq(categoriesTable.id, catId));
        deletedCategories++;
      }
    }
  }

  logger.info(
    { deletedEcommerce, deletedBranch, restoredEcommerce, restoredBranch, deletedCategories },
    "Import rollback completed",
  );

  return { deletedEcommerce, deletedBranch, restoredEcommerce, restoredBranch, deletedCategories };
}
