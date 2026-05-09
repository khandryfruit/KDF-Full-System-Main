# Migration 0001: Add external source ID columns to products

## Purpose

Enables the Shopify and WooCommerce sync loops to track each product's stable
external ID so that re-imports after a title or handle change update the
original row instead of inserting a duplicate with a new URL.

## SQL file

`0001-shopify-product-ids.sql` — applied automatically at server startup via
`src/lib/runMigrations.ts`.  The file is fully idempotent (`IF NOT EXISTS`
guards on every statement).

## New columns

| Column                  | Type | Nullable | Constraint         |
|-------------------------|------|----------|--------------------|
| `shopify_product_id`    | text | YES      | UNIQUE (partial, non-NULL) |
| `shopify_handle`        | text | YES      | — (non-unique; changes over time) |
| `woocommerce_product_id`| text | YES      | UNIQUE (partial, non-NULL) |

## One-time backfill

The migration also seeds `shopify_handle` from the current `slug` for every
existing product that has no `shopify_product_id` and whose slug matches the
clean-handle pattern `^[a-z0-9][a-z0-9\-]*[a-z0-9]$`.  This lets the Tier-2
sync lookup find legacy Shopify-sourced products by their previously-used
handle even on the very first sync run after this change.

## Execution result (2026-05-09)

```
ALTER TABLE      — 3 columns added (idempotent on re-run)
CREATE INDEX     — products_shopify_product_id_key
CREATE INDEX     — products_woocommerce_product_id_key
UPDATE 3         — shopify_handle seeded for all existing products
```

| id | name              | slug               | shopify_handle     |
|----|-------------------|--------------------|-------------------|
|  2 | Roasted Almonds   | roasted-almonds    | roasted-almonds   |
| 10 | almonds           | almonds            | almonds           |
| 11 | Cashews nuts 250g | cashews-nuts-250g  | cashews-nuts-250g |

## Re-running

The SQL migration is idempotent and safe to re-run at any time. The
`runMigrations()` function at startup applies all `.sql` files in
`artifacts/api-server/migrations/` in lexicographic order.
