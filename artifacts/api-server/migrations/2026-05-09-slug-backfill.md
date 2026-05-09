# Migration: Slug Backfill — 2026-05-09

## Purpose
One-time cleanup of existing product slugs to ensure all URLs are lowercase,
hyphen-separated, and free of spaces or `%20`-encoded characters.

## Endpoint called
```
POST /api/admin/products/backfill-slugs
```

Handler: `artifacts/api-server/src/routes/products.ts` — `backfillSlugsHandler`
Slug logic: `artifacts/api-server/src/lib/slugify.ts` — `generateSlugFromName` + `ensureUniqueSlug`

## Execution result (2026-05-09 09:41 UTC)

```json
{
  "success": true,
  "fixed": 0,
  "skipped": 3,
  "log": []
}
```

**fixed: 0** — no product slugs needed cleaning.  
**skipped: 3** — all existing products already had clean slugs.

## Products at time of migration

| id | name              | slug               | clean? |
|----|-------------------|--------------------|--------|
|  2 | Roasted Almonds   | roasted-almonds    | yes    |
| 10 | almonds           | almonds            | yes    |
| 11 | Cashews nuts 250g | cashews-nuts-250g  | yes    |

## Post-run URL verification

Tested legacy broken URL:
```
GET /api/products/Cashews%20nuts%20250g
→ HTTP 200 OK
→ X-Canonical-Slug: cashews-nuts-250g
→ Product JSON body returned correctly
```

The fallback slug-cleaning path in `GET /products/:id` already handles requests
for unclean slugs transparently and emits the `X-Canonical-Slug` header so the
frontend can redirect the browser to the canonical URL.

## Re-running

The endpoint is idempotent — it is safe to call again at any time.
Use the convenience script:
```
SESSION_SECRET=<secret> pnpm --filter @workspace/scripts run backfill-slugs
```
