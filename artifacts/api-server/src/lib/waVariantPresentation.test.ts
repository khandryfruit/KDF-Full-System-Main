import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  enrichVariants,
  formatPriceFull,
  formatVariantListTitle,
  normalizeSizeLabel,
  parseWeightGrams,
  buildVariantListRows,
} from "./waVariantPresentation.js";

describe("waVariantPresentation", () => {
  it("formats full prices without ellipsis", () => {
    assert.equal(formatPriceFull(1200), "Rs 1,200");
    assert.equal(formatPriceFull(4800), "Rs 4,800");
  });

  it("keeps list title short (size only)", () => {
    const title = formatVariantListTitle("250GM");
    assert.ok(title.length <= 24);
    assert.ok(!title.includes("Rs"));
    assert.match(title, /250g/i);
  });

  it("puts full price in list description", () => {
    const opts = [
      { id: "1", title: "250GM", price: 1200 },
      { id: "2", title: "500GM", price: 2200 },
      { id: "3", title: "1KG", price: 4800 },
    ];
    const enriched = enrichVariants(opts, "ur");
    const rows = buildVariantListRows(enriched);
    assert.ok(rows[0]!.description.includes("1,200") || rows[0]!.description.includes("1200"));
    assert.ok(rows[1]!.description.includes("2,200") || rows[1]!.description.includes("2200"));
    assert.equal(rows.length, 3);
  });

  it("parses weights", () => {
    assert.equal(parseWeightGrams("250GM"), 250);
    assert.equal(parseWeightGrams("1kg"), 1000);
    assert.equal(normalizeSizeLabel("500 GM"), "500g");
  });

  it("marks savings on larger packs", () => {
    const enriched = enrichVariants(
      [
        { id: "1", title: "250g", price: 1200 },
        { id: "2", title: "500g", price: 2200 },
      ],
      "en",
    );
    assert.ok(enriched[1]!.savingsLine.includes("Save"));
  });
});
