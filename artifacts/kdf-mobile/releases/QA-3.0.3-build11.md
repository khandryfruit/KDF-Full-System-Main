# KDF Rider 3.0.3 (build 11) — QA checklist

APK: `kdf-rider-3.0.3-build11.apk` (versionName 3.0.3, versionCode 11)

## Automated checks (done before release)

- [x] TypeScript typecheck (`pnpm --filter @workspace/kdf-mobile exec tsc`)
- [x] No storefront invoice URL (`khanbabadryfruits.com/invoice`) in rider app
- [x] Invoice uses API: `/api/rider/deliveries/:id/invoice?token=...`
- [x] `react-native-webview` bundled in release APK
- [x] APK badging: `com.kdfnuts.rider` v3.0.3 / 11

## Device QA (run on a rider phone)

1. Install APK, log in, open an assigned order.
2. **View Invoice** — in-app WebView shows KDF invoice HTML (not Drivers redirect).
3. **Send Invoice (WA)** — WhatsApp opens with formatted message + API invoice link.
4. **Share** — system share sheet includes same formatted invoice text.
5. Status flow: picked → out for delivery → proof upload → delivered (proof gate if API deployed).
6. New order: push/alert still works (requires api-server with matching push payload).

## API dependency

Redeploy **api-server** from `main` (commit with invoice HTML + Lahore auto-assign) so invoice WebView and server push match the app.

## Note on printing

There is no native print/PDF module in 3.0.3. Invoice = WebView HTML + WhatsApp formatted message. Use WA share or screenshot from WebView if a paper copy is needed.
