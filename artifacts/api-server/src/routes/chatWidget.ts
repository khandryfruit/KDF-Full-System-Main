/**
 * chatWidget.ts
 *
 * Serves the embeddable Shopify/external chat widget:
 *   GET /widget.js          — vanilla JS SDK (embed on any website)
 *   GET /api/chat/shopify-install  — Shopify Liquid snippet + instructions
 */
import { Router, type Request, type Response } from "express";

const router = Router();

/* ────────────────────────────────────────────────────────────
   Helper: detect the public-facing base URL from the request
   (works behind Replit proxy, custom domains, and local dev)
──────────────────────────────────────────────────────────── */
function getBaseUrl(req: Request): string {
  const proto  = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ?? "https";
  const host   = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ?? req.headers.host ?? "";
  return `${proto}://${host}`;
}

/* ═══════════════════════════════════════════════════════════
   GET /widget.js  — embeddable SDK
═══════════════════════════════════════════════════════════ */
router.get("/widget.js", (req: Request, res: Response) => {
  const baseUrl = getBaseUrl(req);

  /* Detect if running in Replit dev (path-prefixed) or production (root) */
  const isReplitDev  = host_is_dev(req);
  /* In dev kdf-nuts serves at /kdf-nuts/ path; prod serves at root */
  const embedBase    = isReplitDev ? `${baseUrl}/kdf-nuts/home` : `${baseUrl}/home`;
  /* Always pass apiUrl so the iframe uses the correct absolute API origin */
  const apiUrl       = `${baseUrl}/api`;
  const embedUrl     = `${embedBase}?embed=1&apiUrl=${encodeURIComponent(apiUrl)}`;

  const js = `/* KDF NUTS Chat Widget v2.0 — https://kdfnuts.com */
(function () {
  if (window._KDFChatLoaded) return;
  window._KDFChatLoaded = true;

  /* ── Config ─────────────────────────────────── */
  var cfg       = window.KDFChatConfig || {};
  var EMBED_URL = cfg.embedUrl || ${JSON.stringify(embedUrl)};
  var PRIMARY   = cfg.color    || '#5FA800';

  /* ── Shopify context auto-detection ─────────── */
  var shopifyCtx = null;
  try {
    if (cfg.customer) {
      shopifyCtx = cfg.customer;
    } else if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta) {
      var m = window.ShopifyAnalytics.meta;
      shopifyCtx = { id: m.page && m.page.customerId };
    }
  } catch (e) {}

  /* ── Inject CSS ──────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = [
    '#kdf-chat-btn{position:fixed;bottom:20px;right:20px;width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;z-index:2147483645;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.25);transition:transform .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent;}',
    '#kdf-chat-btn:hover{transform:scale(1.07);box-shadow:0 6px 28px rgba(0,0,0,0.30);}',
    '#kdf-chat-btn[data-open="true"]{background:#374151!important;}',
    '#kdf-chat-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;border-radius:9px;display:none;align-items:center;justify-content:center;padding:0 4px;line-height:1;border:2px solid #fff;font-family:system-ui,sans-serif;}',
    '#kdf-chat-iframe{position:fixed;bottom:90px;right:20px;width:380px;height:620px;border:none;border-radius:16px;box-shadow:0 10px 50px rgba(0,0,0,0.22);z-index:2147483644;display:none;transition:opacity .25s,transform .25s;opacity:0;transform:translateY(12px) scale(0.97);}',
    '#kdf-chat-iframe.kdf-open{display:block;opacity:1;transform:translateY(0) scale(1);}',
    '@media(max-width:640px){',
      '#kdf-chat-iframe{bottom:0;right:0;width:100%;height:100%;border-radius:0;box-shadow:none;}',
      '#kdf-chat-btn{bottom:16px;right:16px;}',
    '}',
  ].join('');
  document.head.appendChild(style);

  /* ── Create button ───────────────────────────── */
  var btn   = document.createElement('button');
  btn.id    = 'kdf-chat-btn';
  btn.title = 'Chat with KDF Nuts';
  btn.style.backgroundColor = PRIMARY;
  btn.setAttribute('aria-label', 'Open Chat');

  var badge      = document.createElement('span');
  badge.id       = 'kdf-chat-badge';
  badge.setAttribute('aria-hidden', 'true');

  var iconOpen   = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var iconClose  = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  btn.innerHTML  = iconOpen;
  btn.appendChild(badge);

  /* ── Create iframe ───────────────────────────── */
  var iframe    = document.createElement('iframe');
  iframe.id     = 'kdf-chat-iframe';
  iframe.allow  = 'microphone';
  iframe.setAttribute('aria-label', 'KDF Nuts Chat');
  var iframeLoaded = false;

  /* ── Mount to DOM ────────────────────────────── */
  document.body.appendChild(iframe);
  document.body.appendChild(btn);

  /* ── Context sender ──────────────────────────── */
  function sendContext() {
    try {
      iframe.contentWindow.postMessage({
        type: 'KDF_SHOPIFY_CONTEXT',
        customer: shopifyCtx || cfg.customer || null,
        cart:     cfg.cart    || null,
        page:     window.location.href,
        pageTitle: document.title,
        store:    'shopify',
      }, '*');
    } catch (e) {}
  }

  /* ── Open / Close ────────────────────────────── */
  var isOpen = false;

  function openChat() {
    if (!iframeLoaded) {
      iframe.src = EMBED_URL;
      iframeLoaded = true;
      iframe.onload = function () { sendContext(); };
    }
    isOpen = true;
    iframe.classList.add('kdf-open');
    btn.innerHTML = iconClose;
    btn.appendChild(badge);
    btn.setAttribute('data-open', 'true');
    btn.setAttribute('aria-label', 'Close Chat');
    /* Send context after slight delay in case iframe just loaded */
    setTimeout(sendContext, 600);
  }

  function closeChat() {
    isOpen = false;
    iframe.classList.remove('kdf-open');
    btn.innerHTML = iconOpen;
    btn.appendChild(badge);
    btn.removeAttribute('data-open');
    btn.setAttribute('aria-label', 'Open Chat');
  }

  btn.addEventListener('click', function () {
    isOpen ? closeChat() : openChat();
  });

  /* ── postMessage from iframe ─────────────────── */
  window.addEventListener('message', function (e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'KDF_CLOSE')  closeChat();
    if (e.data.type === 'KDF_UNREAD') {
      var c = parseInt(e.data.count, 10) || 0;
      badge.textContent = c > 99 ? '99+' : String(c);
      badge.style.display = c > 0 ? 'flex' : 'none';
    }
  });

  /* ── Pulse animation after 3s (engagement) ───── */
  setTimeout(function () {
    btn.style.animation = 'none';
    var pulse = document.createElement('style');
    pulse.textContent = '@keyframes kdfPulse{0%,100%{box-shadow:0 4px 20px rgba(0,0,0,0.25)}50%{box-shadow:0 4px 30px rgba(95,168,0,0.55)}}';
    pulse.textContent += '#kdf-chat-btn:not([data-open="true"]){animation:kdfPulse 2.4s ease-in-out 3}';
    document.head.appendChild(pulse);
  }, 3000);

  /* ── Public API ──────────────────────────────── */
  window.KDFChat = {
    open:  openChat,
    close: closeChat,
    init:  function (c) { cfg = Object.assign({}, cfg, c); },
  };

})();
`;

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  /* Allow Shopify and any domain to load this script */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(js);
});

/* ═══════════════════════════════════════════════════════════
   GET /api/chat/shopify-install  — installation guide + snippet
═══════════════════════════════════════════════════════════ */
router.get("/chat/shopify-install", (req: Request, res: Response) => {
  const base = getBaseUrl(req);
  const widgetUrl = `${base}/api/widget.js`;

  res.json({
    widgetUrl,
    embedUrl: `${base}/kdf-nuts/home?embed=1`,
    liquidSnippet: `{%- comment -%} KDF NUTS Live Chat Widget — paste before </body> {%- endcomment -%}

{%- if customer -%}
<script>
  window.KDFChatConfig = {
    customer: {
      id:    "{{ customer.id }}",
      name:  "{{ customer.first_name | escape }} {{ customer.last_name | escape }}",
      email: "{{ customer.email | escape }}",
      phone: "{{ customer.phone | escape }}"
    },
    cart: {{ cart | json }},
    store: "shopify"
  };
</script>
{%- endif -%}
<script src="${widgetUrl}" defer></script>`,

    headlessSnippet: `<!-- For headless Shopify / Hydrogen -->
<Script src="${widgetUrl}" strategy="lazyOnload" />`,

    manualInit: `<!-- Manual init (optional) -->
<script src="${widgetUrl}"></script>
<script>
  window.KDFChat.init({
    customer: { name: "Ali", phone: "03001234567" },
    store: "shopify"
  });
  window.KDFChat.open(); // open programmatically
</script>`,

    steps: [
      "1. Shopify Admin → Online Store → Themes → Edit Code",
      "2. Open layout/theme.liquid",
      "3. Paste the Liquid Snippet just before the </body> tag",
      "4. Save → Preview your store",
      "5. Green chat button should appear bottom-right",
    ],
  });
});

/* ─── tiny helper ─── */
function host_is_dev(req: Request): boolean {
  const host = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "") as string;
  return host.includes("replit") || host.includes("localhost") || host.includes("127.0.0.1");
}

export default router;
