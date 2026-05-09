# KDF NUTS eCommerce Platform

KDF NUTS is a full-stack eCommerce platform for KDF NUTS, offering a storefront, admin panel, and AI-powered features for enhanced customer experience and streamlined operations.

## Run & Operate

*   **Install dependencies:** `pnpm install`
*   **Run development server:** `pnpm dev`
*   **Build:** `pnpm build`
*   **Typecheck:** `pnpm typecheck`
*   **Codegen (API client):** `pnpm codegen`
*   **DB Push (Drizzle ORM):** `pnpm db:push`
*   **Required Env Vars:** `OPENAI_API_KEY`, `DATABASE_URL`, `SESSION_SECRET`, `META_APP_ID`, `META_APP_SECRET`, `META_CONFIG_ID`, `FCM_SERVER_KEY`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `GOOGLE_MAPS_API_KEY`

## Stack

*   **Monorepo:** pnpm workspaces
*   **Runtime:** Node.js v24
*   **Language:** TypeScript v5.9
*   **Backend:** Express 5, PostgreSQL, Drizzle ORM
*   **Frontend:** React, Vite, TailwindCSS v4, TanStack Query v5, Wouter
*   **Validation:** Zod
*   **API Codegen:** Orval
*   **Build Tool:** esbuild

## Where things live

*   `/apps/api-server`: Backend API and business logic.
*   `/apps/kdf-nuts`: Customer-facing storefront.
*   `/apps/kdf-admin`: Administrative panel.
*   `/apps/mockup-sandbox`: Component development and preview.
*   `/packages/lib`: Shared utilities and types.
*   **DB Schema:** `/apps/api-server/src/db/schema.ts`
*   **API Contracts:** `/apps/api-server/src/lib/api-spec.ts` (OpenAPI specification)
*   **Theme Files (Tailwind):** `/apps/*/tailwind.config.ts`

## Architecture decisions

*   **Monorepo Structure:** Uses pnpm workspaces to separate frontend, backend, and shared libraries, promoting modularity and code reuse.
*   **AI Integration:** Leverages OpenAI for chatbot, content generation, and intelligent product integration within social media interactions, centralizing AI capabilities.
*   **WhatsApp as Core Communication:** Deep integration with Meta Graph API for notifications, marketing campaigns, customer support, and order automation.
*   **Real-time Admin Updates:** Employs Server-Sent Events (SSE) for critical alerts like new orders to ensure immediate administrative awareness.
*   **Cursor-based Shopify Sync:** Implemented unlimited, background job-driven Shopify synchronization for orders, customers, and products to handle large datasets efficiently without timeouts.
*   **Auto Shopify Sync Engine (`lib/shopifyAutoSync.ts`):** Incremental background sync every 15 min (only records updated since last sync), HMAC-verified webhooks, webhook registration, courier→Shopify fulfillment push, and in-memory status telemetry. Scheduler starts with `startShopifyAutoSync(15)` in `index.ts`.
*   **Facebook OAuth domain detection:** `getPublicDomain(req?)` in `social.ts` checks `X-Forwarded-Host` for custom domains (e.g. `admin.khanbabadryfruits.com`) before falling back to `REPLIT_DOMAINS`. Override with `META_DOMAIN_OVERRIDE` env var.
*   **OnDrive Automation Engine (`lib/ondriveEngine.ts`):** Central Shopify→WhatsApp→Courier pipeline. Sends WA order confirmation with interactive Confirm/Cancel buttons, detects 25+ confirmation keywords (English + Urdu) in BRANCH 0 of the webhook handler (highest priority), then auto-books via real courier API (PostEx/TCS/Leopards/Trax). Sends branded tracking update on success. DB table: `shopify_order_confirmations`.

## Product

*   **Dual Storefronts:** KDF NUTS and KDF Plus.
*   **Admin Panel:** Comprehensive management for products, orders, customers, and system settings.
*   **AI Chatbot & Website Widget:** Customer support, product search, and order assistance. `chatbot_settings.is_enabled=true`, `ai_model=gpt-4o-mini`. Key: stored in `ai_settings.openai_api_key`.
*   **Live Chat Lead Capture + CRM:** Pre-chat form (Name, Phone required; Email, City optional) on both KDF Nuts and KDF Plus widgets. DB table: `chat_leads` (includes `interested_products` JSONB + `cart_abandoned` JSONB). localStorage keys: `kdfnuts_lead` / `kdfplus_lead`. API: `POST /api/chat/lead` (public), `PATCH /api/chat/lead/activity` (public — tracks cart_add/buy_now/order_placed per sessionId), `GET /api/admin/chat/leads`, `PUT /api/admin/chat/leads/:id/status`, `DELETE /api/admin/chat/leads/:id`, `GET /api/admin/chat/leads/export` (CSV with interested products), `POST /api/admin/chat/leads/bulk-wa` (bulk WhatsApp campaign to leads). Admin CRM page at `/chat-leads` — stats (total/new/ordered/converted/abandoned cart), Interests column with product badges, abandoned cart badge, checkbox multi-select, Bulk WA Campaign modal with 5 templates + {{name}} merge tag, abandoned cart one-click recovery per lead, chat history link, export includes interested products.
*   **Voice Ordering:** Web Speech API mic button in chat input (Urdu `ur-PK` → English `en-US` fallback). Red pulse when listening. Auto-sends on transcript.
*   **GPS Address Auto-detection:** "Auto-detect my address" button in order form Step 2. Uses `POST /api/locations/geocode` → fills address + city. Falls back to OpenStreetMap Nominatim if Google Maps not configured.
*   **Enhanced Variant Buttons:** ProductCard variant buttons show weight + price stacked (e.g. "500g / Rs.1,699"). Selected = green background. Price updates dynamically.
*   **AI Auto-Cart Building:** AI tool `auto_add_to_cart` detects product + weight/qty from natural language ("1 kilo badam", "500g pista") and automatically adds to cart without manual clicks. Returns `autoCart` array in response → frontend auto-populates chatCart + shows `AutoCartBanner`. Word map: badam=almonds, pista=pistachios, akhrot=walnuts, kaju=cashews.
*   **Human Support Escalation:** AI tool `escalate_to_human` triggers when customer says "human/banda/manager/real person/complaint". Shows `HumanEscalationCard` with WhatsApp redirect button + support hours. "👤 Human Support" quick chip added to chat.
*   **Voice Hint Bar:** Green hint bar "Tap mic to speak your order in Urdu or English" shown above input when chat first opens (messages ≤ 1).
*   **AI Content Generation:** Product descriptions, categories, blog posts, and SEO content.
*   **WhatsApp Automation:** Notifications, marketing campaigns, and customer support.
*   **Bidding/Auction & Restock Notifications:** Customer engagement and inventory management.
*   **Enhanced CRM:** Customer profiles and direct communication.
*   **Shopify Integration:** Multi-store management, data synchronization, and marketing.
*   **Courier Dashboard:** Delivery management, financial analytics, auto-retargeting, and reporting.
*   **TCS ECOM API:** Uses `ociconnect.tcscourier.com/ecom/api`. Auth: `GET /authentication/token?username=&password=` with `X-IBM-Client-Id: username` → fresh `accessToken` per booking. Booking: `POST /booking/create` with `{ accesstoken, shipperinfo: { tcsaccount: username }, consigneeinfo, vendorinfo, shipmentinfo }`. Only 2 required settings: username + password. bearerToken optional (COD tracking fallback only). Cost Center Code = first number in Pickup Address string (e.g. "999").
*   **OnDrive Logistics Engine:** WhatsApp confirmation flow → real courier API auto-booking pipeline. `POST /api/admin/shopify/orders/:id/send-confirmation`, `POST /api/admin/shopify/orders/:id/ondrive-book`, `GET /api/admin/logistics/confirmations`, `POST /api/admin/logistics/confirmations/bulk-send`, `GET /api/admin/logistics/confirmations/stats`. Admin page at `/logistics/confirmations`.
*   **Lahore Local Delivery & Rider Management:** Full local rider dispatch system for Lahore orders. DB tables: `riders`, `rider_deliveries`. Routes: `GET/POST/PUT/DELETE /api/admin/riders`, `GET /api/admin/riders/lahore-orders`, `GET /api/admin/riders/stats`, `POST /api/admin/riders/assign`, `POST /api/admin/riders/auto-assign`, `POST /api/admin/riders/deliveries/:id/send-wa`, `PUT /api/admin/riders/deliveries/:id/status`, `GET /api/admin/riders/orders/:orderId/invoice` (HTML). Admin pages at `/logistics/lahore` and `/logistics/riders`.
*   **Rider Mobile App (Expo/Android APK) — "KDF RIDER LAHORE":** Production-ready logistics app (`artifacts/kdf-mobile`). App display name: `KDF RIDER LAHORE`, Android package: `com.kdfnuts.rider`, Expo slug: `kdf-rider-lahore`, EAS projectId: `f5433930-a95c-4ac1-857f-dfdafc2fe4d1`. Dark navy/green design. Rider JWT auth (`role: "rider"`, 30d expiry, uses `SESSION_SECRET`). API Routes: `POST /api/rider/auth/login`, `GET /api/rider/auth/me`, `GET /api/rider/stats`, `GET /api/rider/deliveries`, `GET /api/rider/deliveries/:id`, `PUT /api/rider/deliveries/:id/status`, `GET /api/rider/deliveries/:id/invoice`, `POST /api/admin/riders/:id/set-password`. Screens: Login, Dashboard (earnings + 6-stat grid + active orders), Orders (filter by status), Order Detail (packing checklist + invoice + WA share), Profile. Auto-refresh every 10s. Test credentials: `03147009134` / `rider1234`. **Production builds:** APK → `pnpm --filter @workspace/kdf-mobile run build:apk` | AAB → `pnpm --filter @workspace/kdf-mobile run build:aab`. Set `EXPO_PUBLIC_API_URL` in `eas.json` env per profile. No `catalog:` or `@workspace/*` deps — fully EAS-compatible standalone package.
*   **Marketing Hub:** RFM segmentation, retargeting campaigns (WhatsApp/Email), abandoned cart recovery, and campaign queue management.
*   **SEO Management:** Dynamic sitemaps, robots.txt, and blog SEO.
*   **Google Maps Integration:** Location detection and address management.

## User preferences

I want iterative development.
Ask before making major changes.
I prefer detailed explanations.
Changes to the `artifacts/kdf-admin` folder are allowed.
Do not make changes to the `lib/api-spec` file.

## Gotchas

*   **Shopify Sync:** Always ensure background sync jobs complete for large datasets before relying on data freshness. Frontend polls `GET /api/admin/shopify/sync/job/:id` for progress.
*   **Shopify Auto-Sync:** Incremental sync runs every 15 min automatically. Manual trigger: `POST /api/admin/shopify/auto-sync/trigger`. Monitoring: `GET /api/admin/shopify/auto-sync/status`.
*   **Shopify Webhooks:** Register webhooks via `POST /api/admin/shopify/webhooks/register`. Endpoint: `POST /api/shopify/webhook`. Set `webhookSecret` in store config for HMAC verification.
*   **Facebook OAuth:** The redirect URI must be whitelisted in Meta App → Valid OAuth Redirect URIs. With custom domain, it auto-detects from `X-Forwarded-Host`. Set `META_DOMAIN_OVERRIDE=https://admin.khanbabadryfruits.com` as env var if detection fails.
*   **Meezan Bank:** Production server IP (`35.200.254.240`) must be whitelisted by Meezan Bank. Get current IP via `GET /api/admin/meezan/server-ip`.
*   **WhatsApp API:** Be mindful of Meta's rate limits and anti-ban measures; utilize approved templates for marketing to avoid issues.
*   **OnDrive Confirmation Flow:** WA webhook BRANCH 0 intercepts all incoming messages before menu/AI — detects `confirm/yes/ok/han/haan/ji han/theek hai/bilkul` etc. (25+ keywords) + interactive button IDs `confirm_order_*`/`cancel_order_*`. After detection calls `autoBookShipmentForOrder()` which tries real courier API (PostEx/TCS/Leopards/Trax) and falls back to local ID only if API not configured. Sends branded tracking notification on success.
*   **Confirmations Stats route order:** `GET /admin/logistics/confirmations/stats` MUST be registered before `POST /admin/logistics/confirmations/:id/*` routes to avoid Express treating "stats" as an `:id` param.
*   **Rider phone normalisation:** `normalisePhone()` in `riders.ts` auto-converts `03xx` → `+923xx` format on insert/update. Same normalisation in `riders-portal.ts` for login.
*   **Rider password management:** `password_hash text` column added to `riders` table. Set via `POST /api/admin/riders/:id/set-password` or direct SQL with bcryptjs hash. Login requires `status = 'active'`.
*   **Auto-assign round-robin:** `POST /api/admin/riders/auto-assign` distributes unassigned Lahore orders across active riders sorted by fewest active deliveries first.
*   **Customer Segments API:** The `GET /api/admin/shopify/customers/segments` endpoint must be registered before the `customers/:id` route for proper functionality.
*   **Image Uploads:** Product review image uploads use `sharp` for WebP conversion; ensure necessary native dependencies are available in the deployment environment.

## Multi-Branch System (Phase 1 — Complete)

*   **DB Table:** `branches` — `id`, `name`, `slug`, `city`, `address`, `phone`, `whatsapp_number`, `manager_name`, `manager_phone`, `email`, `is_active`, `is_head_office`, `settings`, `monthly_target`, `created_at`, `updated_at`.
*   **API Routes:** `GET/POST /api/admin/branches`, `PUT/DELETE /api/admin/branches/:id`, `GET /api/admin/branches/:id/stats`, `GET /api/admin/branches/dashboard` (all require admin JWT), `POST /api/admin/branches/seed`.
*   **KDF Central Dashboard** (`artifacts/kdf-central`, preview at `/central/`): Standalone React/Vite web app. Navy/green enterprise brand. Admin JWT login → Central dashboard (global KPIs + 14-day revenue chart + city pie + branch list + webhook feed) → Branch list CRUD → Branch detail (per-city analytics: revenue, orders, riders, top products, 7-day chart). Seed defaults: Lahore (HQ), Islamabad, Karachi, Peshawar.
*   **Branch analytics** match orders by `shipping_address->>'city' ILIKE %branch.city%` — no FK to Shopify orders needed.

## Multi-Branch Invoice System (Phase 2 — Complete)

*   **DB Tables:** `branch_users` (staff per branch with `phone`, `email`, `permissions` JSONB), `branch_customers`, `branch_invoices` (with `status` column), `branch_audit_logs`, `branch_returns`. Schema: `lib/db/src/schema/branchInvoice.ts`.
*   **Branch Staff Auth:** Separate JWT (`role: "cashier"|"manager"|"sales"|"operator"`, 7d expiry). `signBranchToken` / `branchMiddleware` in `auth.ts`. Login: `POST /api/branch/auth/login`, session: `GET /api/branch/auth/me`.
*   **Branch API Routes:** `GET /api/branch/stats`, `GET/POST/PUT/DELETE /api/branch/customers`, `GET/POST/PUT/DELETE /api/branch/invoices`, `PUT /api/branch/invoices/:id` (edit+audit), `POST /api/branch/invoices/:id/return` (return/exchange), `GET /api/branch/returns`, `GET /api/branch/audit-logs`.
*   **Admin Branch User Routes:** `GET/POST /api/admin/branches/:id/users`, `PUT/DELETE /api/admin/branches/:id/users/:uid` (with phone/email/permissions JSONB).
*   **Admin Audit/Reporting:** `GET /api/admin/branch-invoices/report`, `GET /api/admin/branch-audit-logs`.
*   **Invoice Statuses:** `draft | completed | edited | returned | partially_returned | exchanged | refunded`.
*   **Permissions System:** JSONB per user — Invoice: `create_invoice, edit_invoice, delete_invoice, print_invoice, return_invoice, apply_discount, view_all_invoices`. Customer: `add/edit/delete_customer`. Payment: `refund_payment, partial_refund, edit_payment`. Reports: `view_branch_reports, view_analytics`. Managers have full access.
*   **Branch Portal Frontend:** Dark navy/emerald design. Login at `/admin/branch-login`, POS at `/admin/branch-pos` (4 tabs: POS, History, Customers, Stats). History tab has invoice edit + return/exchange modals with audit trail. `BranchAuthContext.tsx` guards the portal routes.
*   **Admin Integration:** BranchesPage → Staff & Users tab: role selector (manager/cashier/sales/operator), phone/email fields, permissions checkboxes grouped by category.
*   **Test credentials:** username `lahore_cashier` / password `branch1234` (branch_id=1, Lahore).

## Pointers

*   **Drizzle ORM Docs:** [https://orm.drizzle.team/docs/overview](https://orm.drizzle.team/docs/overview)
*   **TanStack Query Docs:** [https://tanstack.com/query/latest](https://tanstack.com/query/latest)
*   **Orval (OpenAPI client generation):** [https://orval.dev/docs/introduction](https://orval.dev/docs/introduction)
*   **Meta Graph API (WhatsApp Business Platform):** [https://developers.facebook.com/docs/whatsapp](https://developers.facebook.com/docs/whatsapp)
*   **OpenAI API Documentation:** [https://platform.openai.com/docs/overview](https://platform.openai.com/docs/overview)