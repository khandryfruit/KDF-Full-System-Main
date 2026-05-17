import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyWaMessage,
  isPaymentIssueMessage,
  shouldBlockProductCatalog,
} from "./waIntentClassifier.js";
import { isPureGreetingMessage } from "./waProductBrain.js";
import { isGreetingLikeMessage } from "./waIntentSwitch.js";

describe("waIntentClassifier", () => {
  it("classifies payment link failure as payment_issue", () => {
    const msg = "Payment link open nahi ho raha";
    assert.equal(isPaymentIssueMessage(msg), true);
    const c = classifyWaMessage(msg);
    assert.equal(c.intent, "payment_issue");
    assert.equal(c.topic, "payment");
    assert.equal(shouldBlockProductCatalog(c), true);
  });

  it("does not classify payment issue as product search", () => {
    const c = classifyWaMessage("Payment link open nahi ho raha");
    assert.notEqual(c.intent, "product_search");
  });

  it("uses context for ambiguous payment follow-up", () => {
    const c = classifyWaMessage("not working", { lastTopic: "payment" });
    assert.equal(c.intent, "payment_issue");
  });

  it("classifies shop address FAQ", () => {
    const c = classifyWaMessage("Shop address?");
    assert.equal(c.intent, "address_faq");
    assert.equal(shouldBlockProductCatalog(c), true);
  });

  it("classifies pure greetings without catalog", () => {
    for (const msg of ["Hi", "Hello", "Assalam o Alaikum", "AOA", "Hello g", "Hy", "السلام علیکم", "سلام"]) {
      const c = classifyWaMessage(msg);
      assert.equal(c.intent, "greeting", msg);
      assert.equal(shouldBlockProductCatalog(c), true, msg);
      assert.equal(isGreetingLikeMessage(msg), true, msg);
    }
  });

  it("does not treat talk phrases as pure greeting", () => {
    assert.equal(isPureGreetingMessage("Hello bat kre"), false);
    const c = classifyWaMessage("Hello bat kre");
    assert.equal(c.intent, "conversation");
    assert.equal(shouldBlockProductCatalog(c), true);
  });

  it("classifies mixed greeting + product without catalog dump intent", () => {
    const c = classifyWaMessage("Hello almonds chahiye");
    assert.equal(c.blockProductCatalog, true);
    assert.notEqual(c.intent, "greeting");
  });
});
