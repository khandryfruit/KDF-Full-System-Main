/**
 * OpenAI function tools for WhatsApp AI commerce assistant.
 */
import { db, ordersTable, couponsTable, shippingRulesTable } from "@workspace/db";
import { sql, eq, desc, asc } from "drizzle-orm";
import { searchCommerceProductsRanked, commerceToWaCatalogProducts, formatCommerceProductsWhatsAppReply } from "./commerceProductSearch.js";
import { extractProductSearchQuery } from "./waProductEntity.js";
import { listProductsForCustomerQuery } from "./waCategoryIndex.js";

export type WaAiToolContext = {
  phone: string;
};

export async function executeWaAiTool(
  name: string,
  args: Record<string, unknown>,
  _ctx: WaAiToolContext,
): Promise<string> {
  switch (name) {
    case "search_products": {
      const query = String(args.query ?? "").trim();
      if (!query) return "No search query provided.";
      const limit = Math.min(6, Math.max(1, Number(args.limit ?? 4) || 4));
      const { isCategoryBrowseQuery, listCommerceProductsInCategory } = await import("./commerceProductSearch.js");
      const { resolveCanonicalCategoryId } = await import("./waCategoryIndex.js");
      if (isCategoryBrowseQuery(query)) {
        const catId = resolveCanonicalCategoryId(query);
        if (catId) {
          const listed = await listCommerceProductsInCategory(catId, limit);
          if (listed.length) return formatCommerceProductsWhatsAppReply(listed, true);
        }
      }
      const ranked = await searchCommerceProductsRanked(query, limit);
      if (ranked.products.length) {
        return formatCommerceProductsWhatsAppReply(ranked.products, true);
      }
      const cat = await listProductsForCustomerQuery(query);
      if (cat.products.length) {
        return `Category: ${cat.category?.labelEn ?? cat.categoryId}\n${cat.products.slice(0, limit).map((p, i) => `${i + 1}. ${p.name} — ${p.price} — ${p.inStock ? "In stock" : "Out of stock"} — ${p.productUrl}`).join("\n")}`;
      }
      return "No products found. Suggest customer try: badam, pista, kaju, khajoor.";
    }
    case "calculate_order_total": {
      const productQuery = String(args.productQuery ?? "");
      const qty = Math.max(1, Number(args.quantity ?? 1) || 1);
      const ranked = await searchCommerceProductsRanked(productQuery, 1);
      const wa = ranked.products.length ? commerceToWaCatalogProducts(ranked.products)[0] : null;
      if (!wa) return "Product not found — cannot calculate total.";
      let unitPrice = Number.parseFloat(String(wa.rawPrice ?? "0")) || 0;
      const variantTitle = String(args.variantTitle ?? "");
      if (variantTitle && wa.variantOptions?.length) {
        const v = wa.variantOptions.find((o) =>
          String(o.title).toLowerCase().includes(variantTitle.toLowerCase()),
        );
        if (v) unitPrice = Number.parseFloat(String(v.price ?? unitPrice)) || unitPrice;
      }
      const subtotal = unitPrice * qty;
      let delivery = 300;
      const city = String(args.city ?? "").toLowerCase();
      const rules = await db
        .select()
        .from(shippingRulesTable)
        .where(eq(shippingRulesTable.enabled, true))
        .orderBy(asc(shippingRulesTable.priority))
        .catch(() => []);
      const amount = subtotal;
      const rule = rules.find((r: { cities?: string[]; minValue?: number; maxValue?: number; type?: string }) => {
        const cities = Array.isArray(r.cities) ? r.cities.map((c) => c.toLowerCase()) : [];
        if (cities.length && city && !cities.some((c) => city.includes(c))) return false;
        return ["amount", "flat"].includes(String(r.type ?? ""));
      });
      if (rule) delivery = Number((rule as { price?: number }).price ?? 300);
      if (amount >= 10000) delivery = 0;
      let discount = 0;
      const couponCode = String(args.couponCode ?? "").trim().toUpperCase();
      if (couponCode) {
        const [coupon] = await db
          .select()
          .from(couponsTable)
          .where(eq(couponsTable.code, couponCode))
          .limit(1)
          .catch(() => []);
        if (coupon?.active) {
          discount =
            coupon.type === "percentage"
              ? (subtotal * Number(coupon.value)) / 100
              : Math.min(Number(coupon.value), subtotal);
        }
      }
      const total = Math.max(0, subtotal - discount + delivery);
      return `Product: ${wa.name}\nQty: ${qty}\nSubtotal: Rs.${subtotal.toLocaleString()}\nDiscount: Rs.${discount.toLocaleString()}\nDelivery: Rs.${delivery.toLocaleString()}\nTotal: Rs.${total.toLocaleString()}`;
    }
    case "track_order": {
      const input = String(args.input ?? "").trim();
      if (!input) return "Please ask customer for order number or phone.";
      const normalized = input.replace(/\D/g, "");
      const rows = await db
        .select({
          orderNumber: ordersTable.orderNumber,
          status: ordersTable.status,
          total: ordersTable.total,
          trackingId: ordersTable.trackingId,
          createdAt: ordersTable.createdAt,
        })
        .from(ordersTable)
        .where(
          sql`order_number ILIKE ${`%${input}%`} OR shipping_address->>'phone' LIKE ${`%${normalized.slice(-10)}%`}`,
        )
        .orderBy(desc(ordersTable.createdAt))
        .limit(3)
        .catch(() => []);
      if (!rows.length) return "No order found for that reference.";
      return rows
        .map(
          (o) =>
            `Order #${o.orderNumber}: ${o.status}, Total Rs.${o.total}${o.trackingId ? `, Tracking: ${o.trackingId}` : ""}`,
        )
        .join("\n");
    }
    case "start_order": {
      const productName = String(args.productName ?? "");
      return `Order flow ready for ${productName}. Customer should pick variant/size on WhatsApp buttons, then checkout.`;
    }
    case "escalate_to_human":
      return "Escalated to human support team. Customer will receive a callback message.";
    case "auto_add_to_cart": {
      const items = (args.items as Array<{ query?: string; variantHint?: string; qty?: number }>) ?? [];
      const lines: string[] = [];
      for (const item of items) {
        const q = extractProductSearchQuery(String(item.query ?? "")) || String(item.query ?? "");
        const ranked = await searchCommerceProductsRanked(q, 1);
        const wa = ranked.products.length ? commerceToWaCatalogProducts(ranked.products)[0] : null;
        if (!wa) {
          lines.push(`NOT FOUND: ${q}`);
          continue;
        }
        let variant = wa.variantOptions?.[0];
        if (item.variantHint && wa.variantOptions?.length) {
          const hint = item.variantHint.toLowerCase();
          variant =
            wa.variantOptions.find((v) => String(v.title).toLowerCase().includes(hint)) ?? variant;
        }
        const price = variant ? Number.parseFloat(String(variant.price)) : Number.parseFloat(String(wa.rawPrice));
        lines.push(
          `${wa.name} (${variant?.title ?? "Standard"}) ×${item.qty ?? 1} — Rs.${(price * (item.qty ?? 1)).toLocaleString()}`,
        );
      }
      return lines.length
        ? `Cart items resolved:\n${lines.join("\n")}\nAsk customer to confirm on WhatsApp checkout buttons.`
        : "No products matched for cart add.";
    }
    default:
      return `Unknown tool: ${name}`;
  }
}
