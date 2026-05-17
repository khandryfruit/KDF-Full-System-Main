import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shouldResetCheckoutForMessage } from "./waSessionRecovery.js";

describe("checkout city typing must not reset session", () => {
  it('does not reset when customer types "Lahore" in city step', () => {
    assert.equal(shouldResetCheckoutForMessage("Lahore", "wa_order_await_city", "general"), false);
  });

  it('does not reset when customer types "Lhr" in city search', () => {
    assert.equal(shouldResetCheckoutForMessage("Lhr", "wa_order_await_city_search", "general"), false);
  });

  it("does not reset full address line during address step", () => {
    assert.equal(
      shouldResetCheckoutForMessage("M Block Johar Town Lahore", "wa_order_await_address_detail", "general"),
      false,
    );
  });
});
