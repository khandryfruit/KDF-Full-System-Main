import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCommerceStockDeduction,
  findVariantInProduct,
  parseCommerceProductId,
} from "./waCommerceOrderCore.js";

describe("parseCommerceProductId", () => {
  it("parses numeric ids", () => {
    assert.equal(parseCommerceProductId("42"), 42);
    assert.equal(parseCommerceProductId(7), 7);
  });
  it("rejects invalid", () => {
    assert.equal(parseCommerceProductId(""), null);
    assert.equal(parseCommerceProductId("abc"), null);
  });
});

describe("findVariantInProduct", () => {
  const variants = [
    { id: "v-250", name: "Size", value: "250g", stock: 100, price: "1200" },
    { id: "v-500", name: "Size", value: "500g", stock: 50, price: "2200" },
  ];

  it("finds by variant id", () => {
    const v = findVariantInProduct({ variants }, { variantId: "v-250" });
    assert.equal(v?.id, "v-250");
  });

  it("finds by menu index", () => {
    const v = findVariantInProduct({ variants }, { variantId: "2" });
    assert.equal(v?.id, "v-500");
  });

  it("finds by title", () => {
    const v = findVariantInProduct({ variants }, { variantTitle: "500g" });
    assert.equal(v?.id, "v-500");
  });
});

describe("applyCommerceStockDeduction", () => {
  it("deducts variant stock and rolls up product stock", () => {
    const variants = [
      { id: "v-250", name: "Size", value: "250g", stock: 100, price: "1200" },
      { id: "v-500", name: "Size", value: "500g", stock: 50, price: "2200" },
    ];
    const next = applyCommerceStockDeduction({ stock: 150, variants }, "v-250", 1);
    assert.equal(next.variants[0]!.stock, 99);
    assert.equal(next.variants[1]!.stock, 50);
    assert.equal(next.stock, 149);
  });

  it("throws when insufficient variant stock", () => {
    const variants = [{ id: "v1", name: "Size", value: "250g", stock: 0, price: "100" }];
    assert.throws(
      () => applyCommerceStockDeduction({ stock: 0, variants }, "v1", 1),
      /Insufficient stock/,
    );
  });

  it("deducts product-level stock when no variants", () => {
    const next = applyCommerceStockDeduction({ stock: 100, variants: [] }, "x", 1);
    assert.equal(next.stock, 99);
  });
});
