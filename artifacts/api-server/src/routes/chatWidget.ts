/**
 * chatWidget.ts
 *
 * GET /widget.js           — lightweight floating action stack SDK
 * GET /api/chat-embed      — self-contained chat-only HTML page (no storefront)
 * GET /api/chat/shopify-install — installation guide
 */
import { Router, type Request, type Response } from "express";

const router = Router();

function getBaseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ?? "https";
  const host  = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ?? req.headers.host ?? "";
  return `${proto}://${host}`;
}

/** Canonical browser/API origin for widget.js & Liquid (avoids admin.* when Railway Host is wrong). */
function getPublicApiOrigin(req: Request): string {
  const raw = (
    process.env.PUBLIC_API_ORIGIN ||
    process.env.API_PUBLIC_ORIGIN ||
    process.env.RAILWAY_PUBLIC_API_BASE ||
    process.env.VITE_API_BASE_URL ||
    ""
  )
    .toString()
    .trim();
  if (raw) {
    try {
      let u = raw.replace(/\/+$/, "").replace(/\/api\/?$/i, "");
      if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
      const parsed = new URL(u);
      const host = parsed.hostname.toLowerCase();
      if (host && !host.startsWith("admin.") && host !== "value") {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      /* fall through */
    }
  }
  return getBaseUrl(req);
}

function host_is_dev(req: Request): boolean {
  const host = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "") as string;
  return host.includes("replit") || host.includes("localhost") || host.includes("127.0.0.1");
}

/* ═══════════════════════════════════════════════════════════
   GET /api/chat-embed — standalone chat-only HTML page
   No kdf-nuts app, no storefront, pure chat UI
═══════════════════════════════════════════════════════════ */
router.get("/chat-embed", (req: Request, res: Response) => {
  const baseUrl = getPublicApiOrigin(req);
  const apiUrl  = `${baseUrl}/api`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>KDF NUTS Chat</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  html{height:100%;position:relative;}
  /* position:relative + absolute overlay (not fixed) avoids iOS Safari touch dead-zones inside cross-origin iframes */
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;min-height:100dvh;min-height:-webkit-fill-available;height:100%;position:relative;display:flex;flex-direction:column;overflow:hidden;-webkit-overflow-scrolling:touch;}

  /* ── Header ─────────────────────────────────── */
  #hdr{background:linear-gradient(135deg,#2ecc71,#128C7E);padding:11px 14px;display:flex;align-items:center;gap:10px;box-shadow:0 2px 10px rgba(0,0,0,0.18);flex-shrink:0;position:relative;z-index:20;}
  #hdr-avatar{width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.22);border:2px solid rgba(255,255,255,0.35);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800;color:#fff;flex-shrink:0;letter-spacing:0;}
  #hdr-info{flex:1;min-width:0;}
  #hdr-name{font-size:15px;font-weight:700;color:#fff;line-height:1.2;}
  #hdr-status{font-size:11px;color:rgba(255,255,255,0.88);display:flex;align-items:center;gap:4px;margin-top:2px;}
  #hdr-dot{width:6px;height:6px;border-radius:50%;background:#a5f3b4;flex-shrink:0;animation:pulse 2s infinite;}
  .hdr-btn{background:rgba(255,255,255,0.18);border:1.5px solid rgba(255,255,255,0.3);color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .2s;}
  .hdr-btn:hover{background:rgba(255,255,255,0.32);}
  .hdr-btn svg{pointer-events:none;}

  /* ── Messages ────────────────────────────────── */
  #msgs{flex:1;overflow-y:auto;min-height:0;padding:12px 10px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth;background:#f0f2f5;overscroll-behavior:contain;position:relative;z-index:1;}
  #msgs::-webkit-scrollbar{width:3px;}
  #msgs::-webkit-scrollbar-thumb{background:#ccc;border-radius:2px;}

  /* ── Bubbles ─────────────────────────────────── */
  .bubble-wrap{display:flex;align-items:flex-end;gap:6px;}
  .bubble-wrap.me{flex-direction:row-reverse;}
  .avatar-sm{width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#2ecc71,#128C7E);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;flex-shrink:0;}
  .bubble{max-width:82%;padding:9px 13px;border-radius:18px;font-size:13.5px;line-height:1.5;word-break:break-word;}
  .bubble.bot{background:#fff;color:#1a1a1a;border-bottom-left-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,0.1);}
  .bubble.me{background:linear-gradient(135deg,#2ecc71,#128C7E);color:#fff;border-bottom-right-radius:4px;}
  .bubble-time{font-size:10px;opacity:0.55;margin-top:3px;text-align:right;}

  /* ── Typing ──────────────────────────────────── */
  #typing{display:none;align-items:flex-end;gap:6px;padding:2px 0;position:relative;z-index:4;flex-shrink:0;background:#f0f2f5;}
  #typing .bubble{background:#fff;padding:10px 15px;}
  .dot{width:7px;height:7px;border-radius:50%;background:#aaa;animation:bounce 1.4s infinite;}
  .dot:nth-child(2){animation-delay:.2s;}
  .dot:nth-child(3){animation-delay:.4s;}
  @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-7px)}}

  /* ── Lead form — flex-shrink:0 (NOT position:fixed) iOS Safari iframe bug fix ── */
  /* position:fixed inside cross-origin iframe breaks touch hit-area on iOS — use normal flow */
  #lead-form{flex-shrink:0;background:#fff;border-top:1px solid #f0f0f0;padding:20px 18px;padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));box-shadow:0 -2px 16px rgba(0,0,0,0.08);position:relative;z-index:10;}
  #lead-err{display:none;font-size:12px;color:#ef4444;margin:-4px 0 10px;font-weight:600;}
  #lead-form h3{font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:4px;}
  #lead-form p{font-size:12px;color:#666;margin-bottom:14px;line-height:1.5;}
  .lf-input{width:100%;border:1.5px solid #e5e7eb;border-radius:12px;padding:11px 13px;font-size:13px;outline:none;transition:border-color .2s;margin-bottom:9px;font-family:inherit;}
  .lf-input:focus{border-color:#2ecc71;}
  #btn-lead{width:100%;background:linear-gradient(135deg,#2ecc71,#128C7E);color:#fff;border:none;border-radius:12px;padding:15px;font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;position:relative;z-index:1;box-shadow:0 4px 14px rgba(46,204,113,0.35);transition:opacity .15s,transform .15s;letter-spacing:.2px;}
  #btn-lead:hover{opacity:.92;}
  #btn-lead:active{opacity:.8;transform:scale(0.98);}
  #btn-lead:disabled{opacity:.65;cursor:not-allowed;transform:none;}
  #lead-skip{display:block;text-align:center;font-size:12px;color:#aaa;margin-top:10px;cursor:pointer;text-decoration:underline;touch-action:manipulation;}

  /* ── Chips ───────────────────────────────────── */
  #chips{display:flex;gap:6px;padding:4px 10px 8px;overflow-x:auto;flex-shrink:0;position:relative;z-index:10;background:#fff;}
  #chips::-webkit-scrollbar{display:none;}
  .chip{background:#fff;border:1px solid #e0e0e0;border-radius:18px;padding:5px 12px;font-size:12px;color:#444;cursor:pointer;white-space:nowrap;transition:all .2s;flex-shrink:0;}
  .chip:hover,.chip:active{background:linear-gradient(135deg,#2ecc71,#128C7E);color:#fff;border-color:transparent;}

  /* ── Input area ──────────────────────────────── */
  #input-area{background:#fff;padding:8px 10px;padding-bottom:calc(8px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:7px;border-top:1px solid #efefef;flex-shrink:0;position:relative;z-index:10;}
  #btn-mic{width:36px;height:36px;border-radius:50%;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#888;transition:color .2s,background .2s;}
  #btn-mic:hover{background:#f5f5f5;color:#2ecc71;}
  #btn-mic.listening{background:#fee2e2;color:#ef4444;animation:micPulse 1s ease-in-out infinite;}
  #msg-input{flex:1;border:1.5px solid #e5e7eb;border-radius:22px;padding:9px 14px;font-size:13.5px;outline:none;resize:none;max-height:90px;overflow-y:auto;transition:border-color .2s;font-family:inherit;background:#fafafa;}
  #msg-input:focus{border-color:#2ecc71;background:#fff;}
  #msg-input,.lf-input{touch-action:manipulation;-webkit-user-select:text;user-select:text;}
  #btn-send,#btn-mic,.chip,.hdr-btn,#btn-lead,#lead-skip,.pv-btn,.prod-btn-view,.prod-btn-add,#cart-checkout-btn,#cart-bar-left{touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;}
  #btn-send{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#2ecc71,#128C7E);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:opacity .2s;}
  #btn-send:hover{opacity:.88;}
  #btn-send:disabled{background:#ddd;cursor:not-allowed;}

  /* ── Product grid (2-col) ────────────────────── */
  .prod-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;margin-top:4px;}
  .prod-grid .prod-card{max-width:100%;margin-top:0;}

  /* ── Product card ────────────────────────────── */
  .prod-card{background:#fff;border-radius:14px;overflow:hidden;max-width:80%;box-shadow:0 2px 10px rgba(0,0,0,0.1);margin-top:4px;}
  .prod-img-wrap{position:relative;width:100%;height:120px;background:#f5f5f5;overflow:hidden;}
  .prod-grid .prod-img-wrap{height:110px;}
  .prod-img-wrap img{width:100%;height:100%;object-fit:cover;}
  .prod-img-placeholder{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:30px;background:linear-gradient(135deg,#f0f9f4,#e8f5e9);}
  /* Badge: orange for discount%, blue for best-seller, red for hot */
  .prod-badge{position:absolute;top:7px;left:7px;color:#fff;font-size:10px;font-weight:700;padding:3px 7px;border-radius:10px;letter-spacing:.2px;}
  .prod-badge.disc{background:#f97316;}
  .prod-badge.star{background:#3b82f6;}
  .prod-badge.hot{background:#ef4444;}
  .prod-body{padding:9px 10px;}
  .prod-name{font-size:12px;font-weight:700;color:#1a1a1a;margin-bottom:6px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
  .prod-variants{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:7px;}
  /* Variant button: weight on top, price below — stacked */
  .pv-btn{border:1.5px solid #e0e0e0;border-radius:8px;padding:4px 7px;font-size:11px;font-weight:600;color:#444;cursor:pointer;background:#fff;transition:all .2s;text-align:center;display:flex;flex-direction:column;align-items:center;line-height:1.2;min-width:52px;}
  .pv-btn .pv-weight{font-size:11px;font-weight:700;}
  .pv-btn .pv-price{font-size:10px;font-weight:600;opacity:.75;}
  .pv-btn:hover,.pv-btn.active{background:#2ecc71;color:#fff;border-color:#2ecc71;}
  .pv-btn.active .pv-price{opacity:.9;}
  .prod-price-row{display:flex;align-items:baseline;gap:5px;margin-bottom:7px;}
  .prod-price{font-size:15px;font-weight:700;color:#2ecc71;}
  .prod-price-orig{font-size:11px;color:#aaa;text-decoration:line-through;}
  .prod-actions{display:flex;gap:6px;}
  .prod-btn-view{flex:1;border:1.5px solid #d1d5db;background:#fff;color:#444;border-radius:9px;padding:7px 4px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;transition:all .2s;}
  .prod-btn-view:active{background:#f3f4f6;}
  .prod-btn-add{flex:1;background:linear-gradient(135deg,#2ecc71,#128C7E);color:#fff;border:none;border-radius:9px;padding:7px 4px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;transition:opacity .2s;}
  .prod-btn-add:active{opacity:.85;}

  /* ── Sticky Cart Bar ─────────────────────────── */
  #cart-bar{background:#fff;border-top:1.5px solid #e8f5e9;display:none;flex-direction:column;flex-shrink:0;position:relative;z-index:10;}
  #cart-bar-row{display:flex;align-items:center;gap:8px;padding:9px 12px;}
  #cart-bar-left{display:flex;align-items:center;gap:7px;flex:1;min-width:0;cursor:pointer;-webkit-tap-highlight-color:transparent;}
  #cart-bar-icon{color:#2ecc71;flex-shrink:0;display:flex;}
  #cart-bar-text{font-size:13px;font-weight:600;color:#1a1a1a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  #cart-chevron{font-size:12px;color:#2ecc71;flex-shrink:0;transition:transform .25s;}
  #cart-checkout-btn{background:linear-gradient(135deg,#2ecc71,#128C7E);color:#fff;border:none;border-radius:20px;padding:9px 16px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0;}
  #cart-checkout-btn:active{opacity:.88;}
  /* Cart detail panel — slides open above the row */
  #cart-panel{background:#f0fdf4;border-bottom:1px solid #d1fae5;overflow:hidden;max-height:0;transition:max-height .25s ease;}
  #cart-panel.open{max-height:200px;}
  #cart-panel-inner{padding:8px 12px;}
  .cart-item{display:flex;align-items:center;font-size:12px;color:#374151;padding:3px 0;gap:6px;}
  .cart-item-name{flex:1;font-weight:500;}
  .cart-item-price{font-weight:700;color:#1a1a1a;}
  .cart-item-rm{background:none;border:none;color:#ef4444;font-size:14px;cursor:pointer;padding:0 2px;flex-shrink:0;line-height:1;}

  /* ── Order tracking card ─────────────────────── */
  .order-card{background:#fff;border-radius:14px;overflow:hidden;max-width:88%;box-shadow:0 2px 10px rgba(0,0,0,0.1);margin-top:4px;}
  .oc-hdr{background:linear-gradient(135deg,#1a1a2e,#16213e);padding:10px 12px;display:flex;align-items:center;gap:8px;}
  .oc-hdr-left{flex:1;}
  .oc-hdr-label{font-size:10px;color:rgba(255,255,255,0.6);}
  .oc-hdr-num{font-size:14px;font-weight:700;color:#fff;font-family:monospace;}
  .oc-badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:12px;border:1px solid;}
  .oc-body{padding:10px 12px;}
  .oc-row{display:flex;align-items:center;gap:6px;margin-bottom:7px;}
  .oc-row-label{font-size:10px;color:#999;}
  .oc-row-val{font-size:12px;font-weight:600;color:#1a1a2e;}
  .oc-courier{background:#f5f5f5;border-radius:8px;padding:7px 10px;display:flex;align-items:center;gap:7px;margin-bottom:7px;}
  .oc-track-id{font-family:monospace;font-size:11px;font-weight:700;color:#1a1a2e;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .oc-track-link{font-size:10px;font-weight:700;color:#2ecc71;text-decoration:none;flex-shrink:0;}
  .oc-items{border-top:1px solid #f0f0f0;padding-top:7px;margin-top:3px;}
  .oc-item{display:flex;justify-content:space-between;font-size:11px;color:#555;padding:2px 0;}
  .oc-item span:last-child{font-weight:600;color:#1a1a2e;}
  .oc-footer{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f0f0f0;padding-top:7px;margin-top:5px;}
  .oc-pay{font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;}
  .oc-total{font-size:14px;font-weight:700;color:#1a1a2e;}
  .oc-btn{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;margin-top:8px;padding:9px;border-radius:10px;font-size:12px;font-weight:700;color:#fff;background:linear-gradient(135deg,#2ecc71,#128C7E);text-decoration:none;border:none;cursor:pointer;}
  .order-notfound{background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:10px 12px;max-width:88%;margin-top:4px;display:flex;gap:8px;align-items:flex-start;}
  .order-notfound p{font-size:12px;color:#92400e;margin:0;}
  /* Tracking screenshot preview */
  .oc-preview{margin-top:8px;border-radius:10px;overflow:hidden;border:1px solid #e8e8e8;background:#f8f8f8;}
  .oc-preview-hdr{font-size:10px;font-weight:700;color:#555;padding:5px 9px;background:#f2f2f2;border-bottom:1px solid #e8e8e8;display:flex;align-items:center;gap:5px;}
  .oc-preview-img{width:100%;display:block;max-height:130px;object-fit:cover;object-position:top;}
  /* Hexon mini widget */
  .oc-hexon-toggle{width:100%;margin-top:6px;padding:8px 12px;border-radius:10px;border:1.5px solid #d1fae5;background:#f0fdf4;color:#065f46;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .2s;}
  .oc-hexon-toggle:hover{background:#dcfce7;}
  .oc-hexon-frame{margin-top:6px;border-radius:10px;overflow:hidden;border:1px solid #e0e0e0;display:none;}
  .oc-hexon-frame iframe{width:100%;height:280px;border:none;display:block;}

  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
  @keyframes micPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  .bubble-wrap,.prod-card,.order-card,.order-notfound{animation:fadeUp .25s ease;}
</style>
</head>
<body>

<!-- Header -->
<div id="hdr">
  <div id="hdr-avatar">K</div>
  <div id="hdr-info">
    <div id="hdr-name">24/7 Live Support</div>
    <div id="hdr-status"><span id="hdr-dot"></span> KDF Nuts Support Team</div>
  </div>
  <button class="hdr-btn" id="btn-refresh" title="Reconnect" aria-label="Reconnect">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
  </button>
  <button class="hdr-btn" id="btn-close" title="Close" aria-label="Close chat">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>
</div>

<!-- Messages -->
<div id="msgs"></div>

<!-- Typing indicator -->
<div id="typing" class="bubble-wrap">
  <div class="avatar-sm">K</div>
  <div class="bubble bot" style="display:flex;gap:4px;padding:12px 15px;">
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  </div>
</div>

<!-- Sticky Cart Bar (above input) -->
<div id="cart-bar">
  <div id="cart-panel"><div id="cart-panel-inner"></div></div>
  <div id="cart-bar-row">
    <div id="cart-bar-left">
      <span id="cart-bar-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      </span>
      <span id="cart-bar-text">0 items</span>
      <span id="cart-chevron">▾</span>
    </div>
    <button id="cart-checkout-btn">Checkout →</button>
  </div>
</div>

<!-- Lead capture form -->
<div id="lead-form">
  <form id="lead-form-el" autocomplete="on" novalidate>
    <h3>👋 Welcome to KDF NUTS!</h3>
    <p>Share your name & number to start chatting with our support team.</p>
    <div id="lead-err" role="alert" aria-live="polite"></div>
    <input class="lf-input" id="lf-name" type="text" placeholder="Your name *" autocomplete="name" name="name" enterkeyhint="next">
    <input class="lf-input" id="lf-phone" type="tel" placeholder="Phone * (03xx… or +92…)" autocomplete="tel" name="phone" enterkeyhint="done">
    <input class="lf-input" id="lf-email" type="email" placeholder="Email (optional)" autocomplete="email" name="email" enterkeyhint="done">
    <button type="submit" id="btn-lead">Start Chat →</button>
  </form>
  <span id="lead-skip">Skip for now</span>
</div>

<!-- Quick chips -->
<div id="chips" style="display:none;">
  <span class="chip" data-msg="mera order kahan hai">📍 Track Order</span>
  <span class="chip" data-msg="Show me your products">🛒 Products</span>
  <span class="chip" data-msg="What are your prices?">💰 Prices</span>
  <span class="chip" data-msg="How long is delivery?">🚚 Delivery</span>
  <span class="chip" data-msg="I want to place an order">📦 Order</span>
  <span class="chip" data-msg="I need human support">👤 Human</span>
</div>

<!-- Input area: [mic] [input] [send] -->
<div id="input-area" style="display:none;">
  <button id="btn-mic" aria-label="Voice input" title="Speak your order">
    <svg id="mic-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
  </button>
  <textarea id="msg-input" rows="1" placeholder="Type or speak your order..." autocomplete="off"></textarea>
  <button id="btn-send" aria-label="Send">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
  </button>
</div>

<script>
(function() {
  var API       = ${JSON.stringify(apiUrl)};
  var WA_URL    = 'https://wa.me/923049996000?text=' + encodeURIComponent('Hello! I need help with my KDF Nuts order.');
  var sessionId = localStorage.getItem('kdf_embed_session') || ('embed_' + Date.now() + '_' + Math.random().toString(36).slice(2,7));
  var leadSaved = localStorage.getItem('kdf_embed_lead') === '1';

  localStorage.setItem('kdf_embed_session', sessionId);

  var msgs      = document.getElementById('msgs');
  var input     = document.getElementById('msg-input');
  var btnSend   = document.getElementById('btn-send');
  var btnMic    = document.getElementById('btn-mic');
  var typing    = document.getElementById('typing');
  var chips     = document.getElementById('chips');
  var inputArea = document.getElementById('input-area');
  var leadForm  = document.getElementById('lead-form');

  /* ── Header buttons ── */
  document.getElementById('btn-close').addEventListener('click', function() {
    try { window.parent.postMessage({ type: 'KDF_CLOSE' }, '*'); } catch(e) {}
  });
  document.getElementById('btn-refresh').addEventListener('click', function() {
    var btn = this; btn.style.opacity = '0.5';
    setTimeout(function(){ btn.style.opacity = '1'; }, 800);
    if (msgs.children.length === 0) return;
    addBubble('Reconnected! How can I help you?', 'bot');
  });

  /* ── Helpers ── */
  function fmtTime() {
    return new Date().toLocaleTimeString('en-PK',{hour:'2-digit',minute:'2-digit',hour12:true});
  }

  function appendToMsgs(el) {
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function addBubble(text, role) {
    var wrap = document.createElement('div');
    wrap.className = 'bubble-wrap' + (role === 'user' ? ' me' : '');
    var avatar = document.createElement('div');
    avatar.className = 'avatar-sm';
    avatar.textContent = role === 'user' ? 'U' : 'K';
    var bub = document.createElement('div');
    bub.className = 'bubble ' + (role === 'user' ? 'me' : 'bot');
    var txt = document.createElement('div');
    txt.textContent = text;
    bub.appendChild(txt);
    var time = document.createElement('div');
    time.className = 'bubble-time';
    time.textContent = fmtTime();
    bub.appendChild(time);
    if (role !== 'user') wrap.appendChild(avatar);
    wrap.appendChild(bub);
    if (role === 'user') wrap.appendChild(avatar);
    appendToMsgs(wrap);
    return wrap;
  }

  function showTyping(show) {
    typing.style.display = show ? 'flex' : 'none';
    if (show) msgs.scrollTop = msgs.scrollHeight;
  }

  /* ── Cart state ── */
  var cart = [];
  var cartPanelOpen = false;

  function updateCartBar() {
    var bar    = document.getElementById('cart-bar');
    var txt    = document.getElementById('cart-bar-text');
    var inner  = document.getElementById('cart-panel-inner');
    if (!cart.length) {
      bar.style.display = 'none';
      cartPanelOpen = false;
      return;
    }
    var totalQty   = cart.reduce(function(s,i){ return s+i.qty; }, 0);
    var totalPrice = cart.reduce(function(s,i){ return s+i.price*i.qty; }, 0);
    txt.textContent = totalQty + ' item' + (totalQty>1?'s':'') + ' — Rs. ' + totalPrice.toLocaleString();
    bar.style.display = 'flex';
    /* Rebuild detail items */
    inner.innerHTML = cart.map(function(item, idx) {
      return '<div class="cart-item">' +
        '<span class="cart-item-name">' + item.name +
          (item.variant ? ' <span style="color:#888;">(' + item.variant + ')</span>' : '') +
          ' ×' + item.qty +
        '</span>' +
        '<span class="cart-item-price">Rs.' + (item.price*item.qty).toLocaleString() + '</span>' +
        '<button class="cart-item-rm" data-idx="' + idx + '">✕</button>' +
      '</div>';
    }).join('');
    inner.querySelectorAll('.cart-item-rm').forEach(function(btn) {
      btn.addEventListener('click', function() {
        cart.splice(parseInt(this.dataset.idx,10), 1);
        updateCartBar();
      });
    });
  }

  /* ── Cart bar toggle + checkout ── */
  document.getElementById('cart-bar-left').addEventListener('click', function() {
    var panel = document.getElementById('cart-panel');
    var chev  = document.getElementById('cart-chevron');
    cartPanelOpen = !cartPanelOpen;
    if (cartPanelOpen) { panel.classList.add('open'); }
    else               { panel.classList.remove('open'); }
    chev.style.transform = cartPanelOpen ? 'rotate(180deg)' : '';
  });
  document.getElementById('cart-checkout-btn').addEventListener('click', function() {
    if (!cart.length) return;
    var summary = cart.map(function(i){ return i.name + (i.variant?' ('+i.variant+')':'') + ' ×'+i.qty; }).join(', ');
    var total   = cart.reduce(function(s,i){ return s+i.price*i.qty; }, 0);
    var msg     = 'Main order dena chahta hoon: ' + summary + ' | Total: Rs.' + total.toLocaleString();
    /* Reset cart after checkout intent */
    cart = [];
    updateCartBar();
    sendMessage(msg);
  });

  /* ── Product card builder ── */
  function buildProductCard(p) {
    var card     = document.createElement('div');
    card.className = 'prod-card';
    var variants   = p.variants || [];
    var selectedIdx = 0;
    var basePrice   = p.price || 0;

    function curPrice() {
      var v = variants[selectedIdx];
      return v && v.price ? Number(v.price) : basePrice;
    }

    /* Image HTML */
    var imgSrc = p.image ? (p.image.startsWith('http') ? p.image : (API.replace('/api','') + '/api/storage/objects/' + p.image)) : null;
    var imgHtml = imgSrc
      ? '<img src="' + imgSrc + '" alt="' + (p.name||'') + '" loading="lazy" onerror="this.parentNode.innerHTML=\'<div class=prod-img-placeholder>🥜</div>\'">'
      : '<div class="prod-img-placeholder">🥜</div>';

    /* Badge — orange for discount %, blue for best-seller, red for hot */
    var badgeHtml = '';
    if (p.discount && p.discount > 0) {
      badgeHtml = '<span class="prod-badge disc">' + p.discount + '% OFF</span>';
    } else if (p.badge === 'Best Seller') {
      badgeHtml = '<span class="prod-badge star">⭐ Best Seller</span>';
    } else if (p.badge === 'Popular' || p.badge === 'Trending') {
      badgeHtml = '<span class="prod-badge hot">🔥 ' + p.badge + '</span>';
    } else if (p.badge) {
      badgeHtml = '<span class="prod-badge star">' + p.badge + '</span>';
    }

    /* Variant buttons — weight on top, price stacked below */
    var varHtml = variants.length ? '<div class="prod-variants">' +
      variants.map(function(v, i) {
        var wt = v.value || v.name || '';
        var pr = v.price ? 'Rs.' + Number(v.price).toLocaleString() : '';
        return '<button class="pv-btn' + (i===0?' active':'') + '" data-idx="'+i+'">' +
          '<span class="pv-weight">' + wt + '</span>' +
          (pr ? '<span class="pv-price">' + pr + '</span>' : '') +
          '</button>';
      }).join('') + '</div>' : '';

    /* Price row with compare-at */
    var priceId = 'pp-' + p.id + '-' + Math.random().toString(36).slice(2,5);
    var origHtml = p.originalPrice ? '<span class="prod-price-orig">Rs.' + Number(p.originalPrice).toLocaleString() + '</span>' : '';

    card.innerHTML =
      '<div class="prod-img-wrap">' + imgHtml + badgeHtml + '</div>' +
      '<div class="prod-body">' +
        '<div class="prod-name">' + (p.name||'Product') + '</div>' +
        varHtml +
        '<div class="prod-price-row">' +
          '<span class="prod-price" id="' + priceId + '">Rs.' + Number(curPrice()).toLocaleString() + '</span>' +
          origHtml +
        '</div>' +
        '<div class="prod-actions">' +
          '<button class="prod-btn-view">👁 View</button>' +
          '<button class="prod-btn-add">🛒 Add</button>' +
        '</div>' +
      '</div>';

    /* Variant selection — update price display */
    card.querySelectorAll('.pv-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        card.querySelectorAll('.pv-btn').forEach(function(b){ b.classList.remove('active'); });
        this.classList.add('active');
        selectedIdx = parseInt(this.dataset.idx, 10);
        var el = document.getElementById(priceId);
        if (el) el.textContent = 'Rs.' + Number(curPrice()).toLocaleString();
      });
    });

    /* Add to cart → update sticky bar */
    card.querySelector('.prod-btn-add').addEventListener('click', function() {
      var v       = variants[selectedIdx];
      var price   = curPrice();
      var varLabel = v ? (v.value || v.name || '') : '';
      var key     = String(p.id) + '-' + (v ? String(v.id||v.value) : 'base');
      var existing = cart.find(function(i){ return i.key===key; });
      if (existing) { existing.qty++; }
      else { cart.push({ key:key, name:p.name||'Product', variant:varLabel, price:price, qty:1 }); }
      updateCartBar();
      /* Visual feedback */
      var btn = this;
      btn.textContent = '✓ Added!';
      btn.style.background = '#16a34a';
      setTimeout(function(){ btn.innerHTML='🛒 Add'; btn.style.background=''; }, 1400);
    });

    /* View → open product page */
    card.querySelector('.prod-btn-view').addEventListener('click', function() {
      var slug = p.slug || (p.name ? p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') : null);
      window.open(slug ? 'https://kdfnuts.com/products/'+slug : 'https://kdfnuts.com/products', '_blank', 'noopener');
    });

    return card;
  }

  /* ── Render products: 2-column grid for ≥2, single card for 1 ── */
  function showProducts(products) {
    if (!products || !products.length) return;
    if (products.length === 1) {
      attachCard(buildProductCard(products[0]));
      return;
    }
    /* Build full-width grid wrapper */
    var gridWrap = document.createElement('div');
    gridWrap.style.cssText = 'padding:0 4px 8px;width:100%;';
    var grid = document.createElement('div');
    grid.className = 'prod-grid';
    products.forEach(function(p) {
      grid.appendChild(buildProductCard(p));
    });
    gridWrap.appendChild(grid);
    msgs.appendChild(gridWrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  /* ── Order tracking card builder ── */
  var HEXON_URL = 'https://ucp-app.hexon.app/track/track.php?hxs_shop=khandryfruit-5155.myshopify.com';

  function buildOrderCard(os) {
    if (os.notFound) {
      var nf = document.createElement('div');
      nf.className = 'order-notfound';
      nf.innerHTML = '<span style="font-size:18px;">⚠️</span><p>Order nahi mila. Phone number ya order ID check karein aur dobara try karein.</p>';
      return nf;
    }
    if (!os.found || !os.orderNumber) return null;
    var statusMap = {
      'Delivered':        { bg:'#dcfce7', color:'#166534', border:'#bbf7d0' },
      'Out for Delivery': { bg:'#dbeafe', color:'#1e40af', border:'#bfdbfe' },
      'In Transit':       { bg:'#e0e7ff', color:'#3730a3', border:'#c7d2fe' },
      'Shipped':          { bg:'#f3e8ff', color:'#6b21a8', border:'#e9d5ff' },
      'Processing':       { bg:'#fef9c3', color:'#854d0e', border:'#fef08a' },
      'Order Received':   { bg:'#f3f4f6', color:'#374151', border:'#e5e7eb' },
      'Delivery Failed':  { bg:'#fee2e2', color:'#991b1b', border:'#fecaca' },
    };
    var sc         = statusMap[os.fulfillmentStatus] || { bg:'#f3f4f6', color:'#374151', border:'#e5e7eb' };
    var isDelivered = os.fulfillmentStatus && os.fulfillmentStatus.toLowerCase().includes('delivered');
    var isTransit   = os.fulfillmentStatus && (os.fulfillmentStatus.toLowerCase().includes('transit') || os.fulfillmentStatus.toLowerCase().includes('out for'));
    var hdrPrefix   = isDelivered ? '✓ ' : isTransit ? '⟳ ' : '';
    var liveUrl     = os.trackingUrl || HEXON_URL;
    var screenshotUrl = os.trackingUrl
      ? ('https://image.thum.io/get/width/400/crop/220/' + encodeURIComponent(os.trackingUrl))
      : null;

    var card = document.createElement('div');
    card.className = 'order-card';

    card.innerHTML =
      '<div class="oc-hdr">' +
        '<div class="oc-hdr-left"><div class="oc-hdr-label">📦 Order</div><div class="oc-hdr-num">#' + (os.orderNumber||'') + '</div></div>' +
        '<span class="oc-badge" style="background:' + sc.bg + ';color:' + sc.color + ';border-color:' + sc.border + '">' + hdrPrefix + (os.fulfillmentStatus||'') + '</span>' +
      '</div>' +
      '<div class="oc-body">' +
        (os.customerName ? '<div class="oc-row"><div><div class="oc-row-label">👤 Customer</div><div class="oc-row-val">' + os.customerName + '</div></div></div>' : '') +
        (os.city ? '<div class="oc-row"><div><div class="oc-row-label">📍 City</div><div class="oc-row-val">' + os.city + '</div></div></div>' : '') +
        (os.dispatchedAt ? '<div class="oc-row"><div><div class="oc-row-label">📅 Dispatched</div><div class="oc-row-val">' + os.dispatchedAt + '</div></div></div>' : '') +
        (os.courierName || os.trackingId ?
          '<div class="oc-courier">' +
            '<div style="flex:1;min-width:0;">' +
              (os.courierName ? '<div style="font-size:10px;color:#999;font-weight:600;">🚚 ' + os.courierName + '</div>' : '') +
              (os.trackingId ? '<div class="oc-track-id">' + os.trackingId + '</div>' : '') +
            '</div>' +
            '<a href="' + liveUrl + '" target="_blank" rel="noopener" class="oc-track-link">Track ↗</a>' +
          '</div>'
        : '') +
        (os.items && os.items.length ? '<div class="oc-items">' + os.items.map(function(it){ return '<div class="oc-item"><span>' + it.name + ' × ' + it.qty + '</span><span>Rs.' + it.price + '</span></div>'; }).join('') + '</div>' : '') +
        '<div class="oc-footer">' +
          (os.financialStatus ? '<span class="oc-pay" style="background:' + (os.financialStatus==='paid'?'#dcfce7':'#fff7ed') + ';color:' + (os.financialStatus==='paid'?'#166534':'#9a3412') + '">' + (os.financialStatus==='paid'?'✓ Paid':'COD Pending') + '</span>' : '<span></span>') +
          (os.totalPrice ? '<span class="oc-total">Rs.' + Number(os.totalPrice).toLocaleString() + '</span>' : '<span></span>') +
        '</div>' +
        /* Screenshot preview strip */
        (screenshotUrl ?
          '<div class="oc-preview">' +
            '<div class="oc-preview-hdr">📸 Live Tracking Preview</div>' +
            '<img class="oc-preview-img" src="' + screenshotUrl + '" alt="Tracking preview" loading="lazy" onerror="this.closest(\'.oc-preview\').style.display=\'none\'">' +
          '</div>'
        : '') +
        /* Primary Track Live button */
        '<a href="' + liveUrl + '" target="_blank" rel="noopener" class="oc-btn">🔗 Track Live</a>' +
        /* Hexon mini widget toggle */
        '<button class="oc-hexon-toggle" id="oc-hx-btn">🔍 Open Tracking Widget</button>' +
        '<div class="oc-hexon-frame" id="oc-hx-frame">' +
          '<iframe src="about:blank" data-src="' + HEXON_URL + '" loading="lazy" title="Live Tracking Widget" allow="same-origin"></iframe>' +
        '</div>' +
      '</div>';

    /* Hexon toggle logic — lazy-load iframe src on first open */
    var hxBtn   = card.querySelector('#oc-hx-btn');
    var hxFrame = card.querySelector('#oc-hx-frame');
    var iframe  = hxFrame.querySelector('iframe');
    var opened  = false;
    hxBtn.addEventListener('click', function() {
      var isOpen = hxFrame.style.display === 'block';
      hxFrame.style.display = isOpen ? 'none' : 'block';
      hxBtn.textContent = isOpen ? '🔍 Open Tracking Widget' : '✕ Close Widget';
      if (!opened && !isOpen) {
        iframe.src = iframe.dataset.src;
        opened = true;
      }
    });

    return card;
  }

  /* ── Attach extra card below last bubble ── */
  function attachCard(card) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;padding-left:32px;margin-bottom:8px;';
    wrap.appendChild(card);
    appendToMsgs(wrap);
  }

  /* ── Send message ── */
  async function sendMessage(text) {
    if (!text.trim()) return;
    input.value = '';
    input.style.height = 'auto';
    btnSend.disabled = true;
    addBubble(text, 'user');
    showTyping(true);
    var controller = new AbortController();
    var timeout = setTimeout(function(){ controller.abort(); }, 28000);
    try {
      var res = await fetch(API + '/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, message: text }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      var data = await res.json();
      showTyping(false);

      var reply = data.reply || data.message || data.text || (data.error ? '❌ ' + data.error : 'Sorry, I could not process that.');
      if (reply) addBubble(reply, 'bot');

      /* Product cards — 2-col grid for ≥2, single for 1 */
      if (data.products && data.products.length) {
        showProducts(data.products);
      }

      /* Order tracking card */
      if (data.orderStatus && (data.orderStatus.found || data.orderStatus.notFound)) {
        var card = buildOrderCard(data.orderStatus);
        if (card) attachCard(card);
      }

      /* Order form trigger */
      if (data.showOrderForm && !data.escalateToHuman) {
        showOrderForm();
      }

      /* Escalate to WhatsApp */
      if (data.escalateToHuman) {
        var waWrap = document.createElement('div');
        waWrap.style.cssText = 'display:flex;padding-left:32px;margin-bottom:8px;';
        waWrap.innerHTML = '<a href="' + WA_URL + '" target="_blank" rel="noopener" style="background:#25D366;color:#fff;border-radius:12px;padding:9px 14px;font-size:13px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:7px;">💬 Chat on WhatsApp — 9am to 9pm PKT</a>';
        appendToMsgs(waWrap);
      }

      /* Unread badge for parent */
      try { window.parent.postMessage({ type: 'KDF_UNREAD', count: 1 }, '*'); } catch(e) {}

    } catch(e) {
      clearTimeout(timeout);
      showTyping(false);
      var errMsg = (e && e.name === 'AbortError') ? '⏱️ Request timed out. Please try again.' : '⚠️ Connection error. Tap below to reach us on WhatsApp.';
      addBubble(errMsg, 'bot');
      if (!e || e.name !== 'AbortError') {
        var waFallback = document.createElement('div');
        waFallback.style.cssText = 'display:flex;padding-left:32px;margin-bottom:8px;';
        waFallback.innerHTML = '<a href="' + WA_URL + '" target="_blank" rel="noopener" style="background:#25D366;color:#fff;border-radius:12px;padding:9px 14px;font-size:13px;font-weight:600;text-decoration:none;">💬 Open WhatsApp</a>';
        appendToMsgs(waFallback);
      }
    }
    btnSend.disabled = false;
  }

  /* ── Voice input (Web Speech API) ── */
  var recognition = null;
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition && btnMic) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    var listeningLang = 'ur-PK';
    recognition.lang = listeningLang;

    recognition.onstart = function() {
      btnMic.classList.add('listening');
      input.placeholder = '🎤 Listening... (Urdu/English)';
    };
    recognition.onresult = function(e) {
      var transcript = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      input.value = transcript;
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 90) + 'px';
      if (e.results[e.results.length - 1].isFinal) {
        btnMic.classList.remove('listening');
        input.placeholder = 'Type or speak your order...';
        if (transcript.trim()) sendMessage(transcript.trim());
      }
    };
    recognition.onerror = function(e) {
      btnMic.classList.remove('listening');
      input.placeholder = 'Type or speak your order...';
      /* Fallback to English if Urdu not supported */
      if (e.error === 'language-not-supported' || e.error === 'network') {
        recognition.lang = 'en-US';
      }
    };
    recognition.onend = function() {
      btnMic.classList.remove('listening');
      input.placeholder = 'Type or speak your order...';
    };

    btnMic.addEventListener('click', function() {
      if (btnMic.classList.contains('listening')) {
        recognition.stop();
      } else {
        recognition.lang = 'ur-PK';
        try { recognition.start(); } catch(e2) {}
      }
    });
  } else if (btnMic) {
    btnMic.style.display = 'none'; /* Hide if not supported */
  }

  /* ── Input auto-resize ── */
  input.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 90) + 'px';
  });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(this.value); }
  });
  btnSend.addEventListener('click', function() { sendMessage(input.value); });

  /* ── Quick chips ── */
  document.querySelectorAll('.chip').forEach(function(chip) {
    chip.addEventListener('click', function() { sendMessage(this.dataset.msg); });
  });

  /* ── Lead form ── */
  function showChatInterface() {
    leadForm.style.display = 'none';
    chips.style.display = 'flex';
    inputArea.style.display = 'flex';
    /* Do NOT call input.focus() here — inside a cross-origin iframe on iOS Safari
       calling focus() immediately triggers the virtual keyboard and causes the
       touch-event system to freeze (blank/unresponsive screen). Let user tap to type. */
    setTimeout(function() {
      addBubble('Assalam o Alaikum! 🌰 Welcome to KDF NUTS. Main aapki 24/7 madad kar sakta hoon — products, prices, orders, ya tracking. Kaise madad karoon?', 'bot');
    }, 200);
  }

  function submitLead() {
    var btnLead = document.getElementById('btn-lead');
    var errEl   = document.getElementById('lead-err');
    var nameEl  = document.getElementById('lf-name');
    var phoneEl = document.getElementById('lf-phone');
    var name  = nameEl.value.trim();
    var phone = phoneEl.value.trim();
    var email = document.getElementById('lf-email').value.trim();
    function showLeadErr(msg) {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }
    function clearLeadErr() {
      if (!errEl) return;
      errEl.style.display = 'none';
      errEl.textContent = '';
    }
    clearLeadErr();
    if (!name || !phone) {
      nameEl.style.borderColor = name ? '#e5e7eb' : '#ef4444';
      phoneEl.style.borderColor = phone ? '#e5e7eb' : '#ef4444';
      showLeadErr('Please fill in your name and phone number.');
      return;
    }
    var phoneDigits = phone.replace(/\\D/g, '');
    if (phoneDigits.length < 10) {
      phoneEl.style.borderColor = '#ef4444';
      nameEl.style.borderColor = '#e5e7eb';
      showLeadErr('Enter a valid phone number (at least 10 digits).');
      return;
    }
    nameEl.style.borderColor = '#e5e7eb';
    phoneEl.style.borderColor = '#e5e7eb';
    try {
      btnLead.disabled = true;
      btnLead.textContent = 'Starting…';
      localStorage.setItem('kdf_embed_lead', '1');
      fetch(API + '/chat/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, phone: phone, email: email || undefined, source: 'shopify_widget', sessionId: sessionId })
      }).catch(function(){});
      showChatInterface();
    } catch (err) {
      try {
        btnLead.disabled = false;
        btnLead.textContent = 'Start Chat →';
      } catch (e2) {}
      showLeadErr('Could not open chat. Try again or tap Skip for now.');
    }
  }

  document.getElementById('lead-form-el').addEventListener('submit', function(e) {
    e.preventDefault();
    submitLead();
  });
  document.getElementById('lead-skip').addEventListener('click', function() {
    localStorage.setItem('kdf_embed_lead', '1');
    showChatInterface();
  });

  /* ── Auto-show chat if lead already captured ── */
  if (leadSaved) { showChatInterface(); }

  /* ── Viewport / keyboard (Shopify iframe-safe) ───────────────────────────
     Never assign body.style.height from visualViewport inside a cross-origin
     iframe: values are often wrong vs the iframe layout box, which clips the
     flex column and makes inputs/buttons feel "frozen" or unclickable. */
  function scrollMsgsToEnd() {
    setTimeout(function(){ try { msgs.scrollTop = msgs.scrollHeight; } catch(e) {} }, 60);
  }
  function onViewportChange() {
    scrollMsgsToEnd();
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onViewportChange);
    window.visualViewport.addEventListener('scroll', onViewportChange);
  }
  window.addEventListener('resize', onViewportChange);
  input.addEventListener('focus', function() {
    setTimeout(function(){ msgs.scrollTop = msgs.scrollHeight; }, 350);
  });

  /* ── Order Form (triggered by showOrderForm from API) ── */
  var orderFormEl = null;
  var orderCart = [];

  function showOrderForm() {
    /* Use current cart items (cart is the global array, cartItems was a bug) */
    orderCart = cart.slice();
    if (orderFormEl) { orderFormEl.remove(); orderFormEl = null; }

    var overlay = document.createElement('div');
    overlay.id = 'order-overlay';
    overlay.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;width:100%;min-height:100%;z-index:999;background:#F0F2F5;display:flex;flex-direction:column;overflow:hidden;touch-action:manipulation;-webkit-overflow-scrolling:touch;';
    overlay.innerHTML = [
      /* Header */
      '<div style="background:linear-gradient(135deg,#5FA800,#4d8a00);padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0;">',
        '<button id="of-back" style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.2);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">',
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>',
        '</button>',
        '<div style="flex:1;">',
          '<p style="font-weight:700;color:#fff;font-size:15px;margin:0;">Place Your Order</p>',
          '<p style="color:rgba(255,255,255,.75);font-size:11px;margin:2px 0 0;">Fill details below to complete order</p>',
        '</div>',
      '</div>',
      /* Scrollable body */
      '<div id="of-body" style="flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px;">',
        /* Cart summary */
        '<div style="background:#fff;border-radius:14px;padding:12px;border:1px solid #e5e7eb;" id="of-cart-summary"></div>',
        /* Form fields */
        '<input id="of-name" placeholder="Full Name *" style="' + fieldStyle() + '">',
        '<input id="of-phone" type="tel" placeholder="Phone Number * (03XXXXXXXXX)" style="' + fieldStyle() + '">',
        '<select id="of-city" style="' + fieldStyle() + '">',
          '<option value="">Select City *</option>',
          ['Lahore','Karachi','Islamabad','Rawalpindi','Faisalabad','Multan','Peshawar','Quetta','Sialkot','Gujranwala','Other'].map(function(c){ return '<option value="' + c + '">' + c + '</option>'; }).join(''),
        '</select>',
        '<textarea id="of-address" rows="3" placeholder="Complete Address *" style="' + fieldStyle() + 'resize:none;"></textarea>',
        '<textarea id="of-notes" rows="2" placeholder="Order notes (optional)" style="' + fieldStyle() + 'resize:none;"></textarea>',
        '<p id="of-error" style="color:#ef4444;font-size:12px;display:none;"></p>',
      '</div>',
      /* Sticky footer */
      '<div style="background:#fff;border-top:1px solid #e5e7eb;padding:12px 14px;padding-bottom:calc(12px + env(safe-area-inset-bottom,0px));flex-shrink:0;">',
        '<button id="of-submit" style="width:100%;padding:14px;border-radius:14px;background:#5FA800;color:#fff;font-weight:700;font-size:15px;border:none;cursor:pointer;">Place Order →</button>',
      '</div>',
    ].join('');

    document.body.appendChild(overlay);
    orderFormEl = overlay;

    /* Fill cart summary */
    var summaryEl = document.getElementById('of-cart-summary');
    if (summaryEl) {
      var total = orderCart.reduce(function(s,i){ return s + i.price * i.qty; }, 0);
      summaryEl.innerHTML = '<p style="font-size:11px;font-weight:700;color:#9ca3af;letter-spacing:.5px;margin:0 0 8px;">ORDER SUMMARY</p>' +
        orderCart.map(function(it){
          return '<div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;padding:2px 0;">' +
            '<span>' + it.name + (it.variant ? ' (' + it.variant + ')' : '') + ' ×' + it.qty + '</span>' +
            '<span style="font-weight:700;color:#5FA800;">Rs.' + (it.price*it.qty).toLocaleString() + '</span>' +
          '</div>';
        }).join('') +
        '<div style="border-top:1px solid #e5e7eb;margin-top:8px;padding-top:8px;display:flex;justify-content:space-between;font-weight:700;font-size:13px;">' +
          '<span>Total</span><span style="color:#5FA800;">Rs.' + total.toLocaleString() + '</span>' +
        '</div>';
    }

    document.getElementById('of-back').addEventListener('click', function(){
      overlay.remove(); orderFormEl = null;
    });

    document.getElementById('of-submit').addEventListener('click', async function() {
      var name    = document.getElementById('of-name').value.trim();
      var phone   = document.getElementById('of-phone').value.trim();
      var city    = document.getElementById('of-city').value;
      var address = document.getElementById('of-address').value.trim();
      var notes   = document.getElementById('of-notes').value.trim();
      var errEl   = document.getElementById('of-error');
      if (!name || !phone || !city || !address) {
        errEl.textContent = 'Please fill all required (*) fields.';
        errEl.style.display = 'block';
        return;
      }
      errEl.style.display = 'none';
      var btn = this; btn.disabled = true; btn.textContent = 'Placing order…';
      try {
        var orderItems = orderCart.map(function(i){
          return { productId: i.productId, variantId: i.variantId, name: i.name, variant: i.variant, price: i.price, qty: i.qty, image: i.image };
        });
        var res2 = await fetch(API + '/chat/direct-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId, items: orderItems, name: name, phone: phone, city: city, address: address, notes: notes })
        });
        var d2 = await res2.json();
        if (!res2.ok) throw new Error(d2.error || 'Order failed');
        /* Clear cart and close */
        cart = [];
        updateCartBar();
        overlay.remove(); orderFormEl = null;
        addBubble('✅ Order placed! Order ID: ' + d2.orderNumber + '. Hamare team se confirm message aayega jald hi. Shukriya!', 'bot');
      } catch(err) {
        errEl.textContent = err.message || 'Order failed. Please try again.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Place Order →';
      }
    });
  }

  function fieldStyle() {
    return 'width:100%;border:1.5px solid #e5e7eb;border-radius:12px;padding:12px 14px;font-size:14px;background:#fff;box-sizing:border-box;font-family:inherit;outline:none;';
  }

})();
</script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(html);
});

/* ═══════════════════════════════════════════════════════════
   GET /widget.js  — Floating Action Stack SDK v3.1
   Chat with Us → opens /api/chat-embed (chat-only, no storefront)
   WhatsApp → window.open wa.me directly
═══════════════════════════════════════════════════════════ */
router.get("/widget.js", (req: Request, res: Response) => {
  const baseUrl   = getPublicApiOrigin(req);
  const embedUrl  = `${baseUrl}/api/chat-embed`;
  const WA_NUMBER = "923049996000";
  const WA_MSG    = encodeURIComponent("Hello! I need help with my order.");
  const WA_URL    = `https://wa.me/${WA_NUMBER}?text=${WA_MSG}`;

  const js = `/* KDF NUTS Chat Widget v3.4 — no full-viewport wrapper (fixes dead clicks / frozen Shopify page behind iframe) */
(function () {
  'use strict';
  if (window._KDFChatLoaded) return;
  window._KDFChatLoaded = true;

  var cfg       = window.KDFChatConfig || {};
  var EMBED_URL = cfg.embedUrl  || ${JSON.stringify(embedUrl)};
  var WA_HREF   = cfg.whatsapp  || ${JSON.stringify(WA_URL)};
  var REOPEN_DELAY = cfg.reopenDelay || 90000; /* 90s auto-reopen after close */

  /* ── Styles ─────────────────────────────────────────── */
  var s = document.createElement('style');
  s.textContent = \`
    /* v3.4: FAB + iframe are appended directly to <body> — never a full-screen transparent layer over the storefront. */
    #kdf-w *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    #kdf-w{position:fixed;bottom:20px;right:20px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:10px;pointer-events:auto;}
    #kdf-fab{width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;background:linear-gradient(135deg,#5FA800,#4a8500);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 24px rgba(95,168,0,0.48);transition:transform .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent;position:relative;touch-action:manipulation;}
    #kdf-fab:hover{transform:scale(1.08);box-shadow:0 6px 30px rgba(95,168,0,0.6);}
    #kdf-fab:active{transform:scale(0.95);}
    #kdf-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;border-radius:9px;display:none;align-items:center;justify-content:center;padding:0 4px;border:2px solid #fff;}
    .kdf-ab{display:flex;align-items:center;gap:9px;background:#fff;border:none;border-radius:28px;padding:9px 18px 9px 9px;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,0.18);white-space:nowrap;font-size:13.5px;font-weight:600;color:#1a1a2e;transition:transform .18s,box-shadow .18s;-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
    .kdf-ab:hover{transform:translateX(-4px);box-shadow:0 6px 24px rgba(0,0,0,0.22);}
    .kdf-ab:active{transform:scale(0.97);}
    .kdf-ai{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    #kdf-stack{display:flex;flex-direction:column;align-items:flex-end;gap:9px;transition:opacity .22s,transform .22s;opacity:0;transform:translateY(10px) scale(0.94);pointer-events:none;}
    #kdf-stack.kdf-vis{opacity:1;transform:none;pointer-events:auto;}
    #kdf-popup{position:fixed;bottom:90px;right:20px;width:370px;height:min(580px,calc(100vh - 120px));max-height:calc(100vh - 120px);border:none;border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,0.25);z-index:3;background:#fff;display:none;opacity:0;transform:translateY(12px) scale(0.96);transition:opacity .28s,transform .28s;}
    #kdf-popup.kdf-open{display:block;opacity:1;transform:none;}
    @media(max-width:480px){
      #kdf-w{bottom:16px;right:16px;}
      #kdf-popup{bottom:0;right:0;width:100%;height:min(90svh,90vh);max-height:90svh;max-height:90vh;border-radius:22px 22px 0 0;}
    }
    @keyframes kdfP{0%,100%{box-shadow:0 4px 24px rgba(95,168,0,0.48)}50%{box-shadow:0 4px 40px rgba(95,168,0,0.78)}}
    #kdf-fab:not([data-open]).kdf-pulse{animation:kdfP 2.2s ease-in-out 3}
  \`;
  document.head.appendChild(s);

  /* ── Icons ──────────────────────────────────────────── */
  var I_CHAT  = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var I_CLOSE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var I_WA    = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.963 2C6.466 2 2 6.466 2 11.963c0 1.82.49 3.524 1.345 4.989L2 22l5.217-1.319A9.925 9.925 0 0 0 11.963 22C17.46 22 22 17.534 22 12.037 22 6.54 17.46 2 11.963 2zm0 18.12a8.168 8.168 0 0 1-4.152-1.132l-.297-.177-3.095.782.812-3.006-.198-.31A8.12 8.12 0 0 1 3.88 12.037c0-4.46 3.624-8.085 8.083-8.085 4.46 0 8.084 3.624 8.084 8.085 0 4.46-3.624 8.083-8.084 8.083z"/></svg>';

  /* ── DOM ────────────────────────────────────────────── */
  var wrap  = document.createElement('div'); wrap.id = 'kdf-w';
  var stack = document.createElement('div'); stack.id = 'kdf-stack';

  var bWA = document.createElement('button'); bWA.className = 'kdf-ab'; bWA.setAttribute('aria-label','WhatsApp');
  bWA.innerHTML = '<span class="kdf-ai" style="background:#25D366">' + I_WA + '</span><span style="color:#1a7a3f;font-weight:700;">WhatsApp</span>';

  var bChat = document.createElement('button'); bChat.className = 'kdf-ab'; bChat.setAttribute('aria-label','Chat with Us');
  bChat.innerHTML = '<span class="kdf-ai" style="background:linear-gradient(135deg,#5FA800,#4a8500)">' + I_CHAT + '</span><span>Chat with Us</span>';

  stack.appendChild(bWA);
  stack.appendChild(bChat);

  var fab   = document.createElement('button'); fab.id = 'kdf-fab'; fab.setAttribute('aria-label','Open Chat');
  fab.innerHTML = I_CHAT;
  var badge = document.createElement('span'); badge.id = 'kdf-badge'; fab.appendChild(badge);

  var popup = document.createElement('iframe'); popup.id = 'kdf-popup'; popup.allow = 'microphone';
  popup.setAttribute('aria-label','KDF NUTS Chat');
  popup.setAttribute('title','KDF NUTS Chat');
  popup.setAttribute('referrerpolicy','strict-origin-when-cross-origin');

  var root = document.createElement('div'); root.id = 'kdf-chat-root';
  wrap.appendChild(stack); wrap.appendChild(fab);
  root.appendChild(wrap);
  root.appendChild(popup);
  document.body.appendChild(root);

  /* ── State ──────────────────────────────────────────── */
  var stackOpen = false, chatOpen = false, iframeLoaded = false, reopenTimer = null;

  /* ── Functions ──────────────────────────────────────── */
  function openStack() {
    stackOpen = true;
    stack.classList.add('kdf-vis');
    fab.setAttribute('data-open', '1');
    fab.innerHTML = I_CLOSE; fab.appendChild(badge);
  }
  function closeStack() {
    stackOpen = false;
    stack.classList.remove('kdf-vis');
    fab.removeAttribute('data-open');
    fab.innerHTML = I_CHAT; fab.appendChild(badge);
  }
  function openChat() {
    if (!iframeLoaded) {
      popup.src = EMBED_URL;
      iframeLoaded = true;
    }
    chatOpen = true;
    popup.classList.add('kdf-open');
  }
  function closeChat() {
    chatOpen = false;
    popup.classList.remove('kdf-open');
    /* Auto-reopen after delay */
    if (reopenTimer) clearTimeout(reopenTimer);
    reopenTimer = setTimeout(function() {
      fab.classList.add('kdf-pulse');
      setTimeout(function(){ fab.classList.remove('kdf-pulse'); }, 8000);
    }, REOPEN_DELAY);
  }

  /* ── Events ─────────────────────────────────────────── */
  fab.addEventListener('click', function(e) {
    e.stopPropagation();
    if (chatOpen) { closeChat(); closeStack(); return; }
    stackOpen ? closeStack() : openStack();
  });

  bChat.addEventListener('click', function(e) {
    e.stopPropagation();
    closeStack();
    chatOpen ? closeChat() : openChat();
  });

  bWA.addEventListener('click', function(e) {
    e.stopPropagation();
    closeStack();
    window.open(WA_HREF, '_blank', 'noopener,noreferrer');
  });

  document.addEventListener('click', function(e) {
    if (chatOpen) return;
    if (stackOpen && !wrap.contains(e.target) && !popup.contains(e.target)) closeStack();
  });

  /* Close from iframe message */
  window.addEventListener('message', function(e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'KDF_CLOSE') { closeChat(); closeStack(); fab.innerHTML = I_CHAT; fab.appendChild(badge); fab.removeAttribute('data-open'); }
    if (e.data.type === 'KDF_UNREAD') {
      var c = parseInt(e.data.count, 10) || 0;
      badge.textContent = c > 99 ? '99+' : String(c);
      badge.style.display = c > 0 ? 'flex' : 'none';
    }
  });

  /* Pulse after 3s to attract attention */
  setTimeout(function() { fab.classList.add('kdf-pulse'); setTimeout(function(){ fab.classList.remove('kdf-pulse'); }, 8000); }, 3000);

  /* Public API */
  window.KDFChat = {
    open: openStack,
    openChat: function() { openStack(); openChat(); },
    close: function() { closeStack(); closeChat(); },
    init: function(c) { cfg = Object.assign({}, cfg, c); },
  };

})();
`;

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(js);
});

/* ═══════════════════════════════════════════════════════════
   GET /api/chat/shopify-install — installation guide
═══════════════════════════════════════════════════════════ */
router.get("/chat/shopify-install", (req: Request, res: Response) => {
  const base      = getPublicApiOrigin(req);
  const widgetUrl = `${base}/api/widget.js`;
  const embedUrl  = `${base}/api/chat-embed`;

  res.json({
    widgetUrl,
    embedUrl,
    liquidSnippet: `{%- comment -%} KDF NUTS Live Chat v3.4 — script src must be api.* (never admin.*). Set PUBLIC_API_ORIGIN on api-server if needed. {%- endcomment -%}
<script>
  window.KDFChatConfig = {
    store: "shopify"
{%- if customer -%}
    , customer: {
      id:    "{{ customer.id }}",
      name:  "{{ customer.first_name | escape }} {{ customer.last_name | escape }}",
      email: "{{ customer.email | escape }}",
      phone: "{{ customer.phone | escape }}"
    }
{%- endif -%}
    , cart: {{ cart | json }}
  };
</script>
<script src="${widgetUrl}" defer></script>`,

    steps: [
      "1. Shopify Admin → Online Store → Themes → Edit Code",
      "2. Open layout/theme.liquid",
      "3. Paste the Liquid Snippet just before the </body> tag (config script must run before widget.js)",
      "4. Save → Preview your store",
      "5. Green chat button appears bottom-right; 'Chat with Us' opens the chat iframe (fully clickable)",
      "6. If the chat ever feels frozen after a theme change, hard-refresh (Cmd+Shift+R) once",
      "7. 'WhatsApp' opens wa.me/923049996000 directly",
      "8. After deploy: lead form uses a higher z-index + native <form> submit so 'Start Chat' works reliably in the Shopify iframe (re-copy snippet if you still had cart only for logged-in customers).",
      "9. Railway: attach custom domain api.* ONLY to the api-server service (Dockerfile.api-server). Do not attach api.* to kdf-admin. Set PUBLIC_API_ORIGIN=https://api.<your-domain> on api-server so widget URLs stay correct even if the Host header is unexpected.",
    ],
  });
});

export default router;
