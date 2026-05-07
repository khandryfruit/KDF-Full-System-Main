# Threat Model

## Project Overview

KDF NUTS is a pnpm-monorepo eCommerce platform with a TypeScript/Express API, PostgreSQL via Drizzle, React/Vite storefronts, an admin panel, AI-assisted customer support/content generation, WhatsApp/Meta integrations, Shopify sync, and object-storage-backed media handling. Production-reachable code in this checkout is primarily under `artifacts/`, not `apps/`: the backend is `artifacts/api-server`, storefront/admin frontends are `artifacts/kdf-plus`, `artifacts/kdf-nuts`, and `artifacts/kdf-admin`, and `artifacts/mockup-sandbox` should be treated as dev-only unless production reachability is demonstrated.

## Assets

- **Admin accounts and bearer tokens** -- JWTs grant access to order management, settings, marketing, integrations, and content operations. Compromise enables full administrative control.
- **Customer accounts and order data** -- customer identities, shipping addresses, phone numbers, order histories, tracking data, wallet balances, and loyalty data are business-critical and privacy-sensitive.
- **Third-party integration secrets and delegated tokens** -- Meta app credentials, WhatsApp tokens, Shopify credentials, OpenAI keys, Google Maps keys, and courier API credentials allow external actions on behalf of the business.
- **Private object storage contents** -- uploaded product images, review images, admin assets, and any files stored under the private object directory may contain sensitive or integrity-critical content even when frontends later render them publicly.
- **Business configuration and automation settings** -- SEO settings, marketing rules, social reply configuration, Shopify sync settings, notification settings, and AI prompts directly affect production behavior and brand communications.

## Trust Boundaries

- **Browser/mobile client to API** -- all public storefront, mobile, and admin traffic crosses into the Express API. Clients are untrusted; authentication and authorization must be enforced server-side.
- **Public to authenticated to admin API surfaces** -- storefront browsing is public, customer-account flows require user auth, and admin routes require elevated privileges. These boundaries are high risk because the same API serves all surfaces.
- **API to PostgreSQL** -- the API has broad read/write access to orders, users, tokens, and settings. Input validation and parameterized access are required to prevent tampering and disclosure.
- **API to object storage** -- the API brokers access to both public and nominally private objects. Misclassification or missing ACL enforcement can immediately expose stored files or allow untrusted uploads.
- **API to external providers** -- Meta Graph, WhatsApp, Shopify, Google Maps, OpenAI, couriers, and email providers are outside the trust boundary. OAuth callbacks, webhooks, outbound requests, and secret handling must be validated carefully.
- **Development-only to production boundary** -- `artifacts/mockup-sandbox` and other local-only tooling are assumed non-production. Findings must focus on production-reachable paths only.

## Scan Anchors

- **Production entry points:** `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/app.ts`, and `artifacts/api-server/src/routes/index.ts`.
- **Highest-risk server areas:** `artifacts/api-server/src/lib/auth.ts`, `artifacts/api-server/src/routes/storage.ts`, `artifacts/api-server/src/routes/imageUpload.ts`, `artifacts/api-server/src/routes/social.ts`, `artifacts/api-server/src/routes/whatsapp.ts`, `artifacts/api-server/src/routes/adminNotifications.ts`.
- **Public surfaces:** product/search/chat/order tracking/review upload/storage/public routes and OAuth callbacks that are mounted without auth.
- **Authenticated/admin surfaces:** `/admin/*` API routes, JWT-protected customer routes, SSE notifications, settings/integration routes, and direct object upload helpers used by admin UIs.
- **Usually ignore unless proven reachable:** `artifacts/mockup-sandbox`, local build tooling, and development-only preview assets.

## Threat Categories

### Spoofing

The application relies on JWT bearer tokens for both customer and admin access. The system must ensure signing keys are deployment-specific, unpredictable, and mandatory in production. OAuth callbacks and other delegated-auth flows must bind requests to a user-initiated transaction with anti-CSRF state so attackers cannot connect their own external account to the business configuration.

### Tampering

Customers and unauthenticated visitors can reach ordering, chat, review, upload, and tracking flows. The server must calculate security-sensitive values server-side, validate uploaded content and metadata, and ensure unauthenticated users cannot create or overwrite objects in storage areas that the application later trusts. Integration settings and admin notifications must only be changed by authenticated admins.

### Information Disclosure

Orders, customer data, integration settings, and object storage contents are sensitive. Routes serving files or records must enforce authorization based on the actual object owner or intended visibility, not just path structure. Error handling and logging must avoid leaking secrets or raw tokens, and private storage paths must not become world-readable simply because they are convenient to render in the frontend.

### Denial of Service

The API exposes several public endpoints that can trigger database writes, image processing, AI completions, or object uploads. Production deployments must bound request sizes, validate file types, and apply abuse controls where anonymous traffic can trigger costly work or consume storage.

### Elevation of Privilege

This project has a sharp privilege boundary between storefront users and admins. Every admin-capable route, stream, and callback must enforce server-side authorization consistently. Broken access control in storage, JWT validation, or integration callbacks can let an external attacker escalate from anonymous access to full administrative influence over content, settings, or third-party messaging channels.
