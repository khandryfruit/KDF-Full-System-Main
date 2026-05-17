import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveCityInput, searchCities, smartSearchCities } from "./waPakistanCities.js";

describe("waPakistanCities smart match", () => {
  it("resolves Lahore exactly", () => {
    const r = resolveCityInput("Lahore");
    assert.equal(r.kind, "confirm");
    assert.equal(r.city, "Lahore");
  });

  it("resolves Lhr alias", () => {
    const r = resolveCityInput("Lhr");
    assert.equal(r.kind, "confirm");
    assert.equal(r.city, "Lahore");
  });

  it("resolves Khi → Karachi", () => {
    assert.equal(resolveCityInput("Khi").city, "Karachi");
  });

  it("corrects Lahor typo", () => {
    const r = resolveCityInput("Lahor");
    assert.equal(r.kind, "confirm");
    assert.equal(r.city, "Lahore");
  });

  it("corrects Krachi typo", () => {
    assert.equal(resolveCityInput("Krachi").city, "Karachi");
  });

  it("corrects Multn typo", () => {
    assert.equal(resolveCityInput("Multn").city, "Multan");
  });

  it("shows suggestions for short Lah prefix", () => {
    const r = resolveCityInput("Lah");
    assert.equal(r.kind, "suggest");
    assert.ok(r.suggestions.includes("Lahore"));
  });

  it("smartSearch ranks Lahore for Lah", () => {
    const hits = smartSearchCities("Lah", 5);
    assert.ok(hits.some((h) => h.city === "Lahore"));
  });

  it("searchCities returns Lahore for Isb", () => {
    assert.equal(searchCities("Isb", 1)[0], "Islamabad");
  });
});
