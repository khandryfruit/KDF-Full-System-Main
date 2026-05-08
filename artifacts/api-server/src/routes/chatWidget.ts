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

function host_is_dev(req: Request): boolean {
  const host = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "") as string;
  return host.includes("replit") || host.includes("localhost") || host.includes("127.0.0.1");
}

/* ═══════════════════════════════════════════════════════════
   GET /widget.js  — embeddable SDK
   Mini floating action stack: Chat with Us + WhatsApp direct
═══════════════════════════════════════════════════════════ */
router.get("/widget.js", (req: Request, res: Response) => {
  const baseUrl     = getBaseUrl(req);
  const isReplitDev = host_is_dev(req);

  /* Embed URL: in dev kdf-nuts is at /kdf-nuts/, in prod at / */
  const embedPath   = isReplitDev ? "/kdf-nuts/" : "/";
  const apiUrl      = `${baseUrl}/api`;
  const embedUrl    = `${baseUrl}${embedPath}?embed=1&apiUrl=${encodeURIComponent(apiUrl)}`;

  const WA_NUMBER   = "923049996000";
  const WA_MESSAGE  = encodeURIComponent("Hello! I need help with my order.");
  const WA_URL      = `https://wa.me/${WA_NUMBER}?text=${WA_MESSAGE}`;

  const js = `/* KDF NUTS Chat Widget v3.0 — Floating Action Stack */
(function () {
  'use strict';
  if (window._KDFChatLoaded) return;
  window._KDFChatLoaded = true;

  /* ── Config ─────────────────────────────────────────── */
  var cfg      = window.KDFChatConfig || {};
  var EMBED_URL = cfg.embedUrl || ${JSON.stringify(embedUrl)};
  var WA_HREF   = cfg.whatsappUrl || ${JSON.stringify(WA_URL)};
  var PRIMARY   = '#25D366';
  var DARK_BTN  = '#1a1a2e';

  /* ── Styles ─────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = \`
    #kdf-fab-wrap *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    #kdf-fab-wrap{position:fixed;bottom:20px;right:20px;z-index:2147483640;display:flex;flex-direction:column;align-items:flex-end;gap:10px;}
    #kdf-fab-main{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:\${PRIMARY};display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.28);transition:transform .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent;position:relative;}
    #kdf-fab-main:hover{transform:scale(1.07);box-shadow:0 6px 28px rgba(0,0,0,0.32);}
    #kdf-fab-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;border-radius:9px;display:none;align-items:center;justify-content:center;padding:0 4px;line-height:1;border:2px solid #fff;}
    .kdf-action-btn{display:flex;align-items:center;gap:10px;background:#fff;border:none;border-radius:28px;padding:9px 16px 9px 10px;cursor:pointer;box-shadow:0 3px 14px rgba(0,0,0,0.18);white-space:nowrap;font-size:14px;font-weight:600;color:#1a1a2e;transition:transform .15s,box-shadow .15s;-webkit-tap-highlight-color:transparent;}
    .kdf-action-btn:hover{transform:translateX(-3px);box-shadow:0 5px 20px rgba(0,0,0,0.22);}
    .kdf-action-icon{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    #kdf-action-stack{display:flex;flex-direction:column;align-items:flex-end;gap:10px;transition:opacity .2s,transform .2s;opacity:0;transform:translateY(8px) scale(0.96);pointer-events:none;}
    #kdf-action-stack.kdf-visible{opacity:1;transform:translateY(0) scale(1);pointer-events:auto;}
    #kdf-chat-popup{position:fixed;bottom:90px;right:20px;width:370px;height:600px;border:none;border-radius:18px;box-shadow:0 12px 50px rgba(0,0,0,0.22);z-index:2147483641;display:none;transition:opacity .25s,transform .25s;opacity:0;transform:translateY(10px) scale(0.97);}
    #kdf-chat-popup.kdf-open{display:block;opacity:1;transform:translateY(0) scale(1);}
    @media(max-width:480px){
      #kdf-fab-wrap{bottom:16px;right:16px;}
      #kdf-chat-popup{bottom:0;right:0;width:100%;height:85vh;border-radius:20px 20px 0 0;box-shadow:0 -4px 30px rgba(0,0,0,0.2);}
    }
    @keyframes kdfPulse{0%,100%{box-shadow:0 4px 20px rgba(0,0,0,0.28)}50%{box-shadow:0 4px 30px rgba(37,211,102,0.55)}}
    #kdf-fab-main.kdf-pulse:not([data-open]){animation:kdfPulse 2.4s ease-in-out 3}
  \`;
  document.head.appendChild(style);

  /* ── Icon SVGs ──────────────────────────────────────── */
  var ICO_CHAT = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICO_WA   = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.963 2C6.466 2 2 6.466 2 11.963c0 1.82.49 3.524 1.345 4.989L2 22l5.217-1.319A9.925 9.925 0 0 0 11.963 22C17.46 22 22 17.534 22 12.037 22 6.54 17.46 2 11.963 2zm0 18.12a8.168 8.168 0 0 1-4.152-1.132l-.297-.177-3.095.782.812-3.006-.198-.31A8.12 8.12 0 0 1 3.88 12.037c0-4.46 3.624-8.085 8.083-8.085 4.46 0 8.084 3.624 8.084 8.085 0 4.46-3.624 8.083-8.084 8.083z"/></svg>';
  var ICO_CLOSE = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  /* ── DOM Structure ──────────────────────────────────── */
  var wrap   = document.createElement('div');
  wrap.id    = 'kdf-fab-wrap';

  /* Action stack (hidden by default) */
  var stack  = document.createElement('div');
  stack.id   = 'kdf-action-stack';

  /* WhatsApp button */
  var btnWA  = document.createElement('button');
  btnWA.className = 'kdf-action-btn';
  btnWA.setAttribute('aria-label', 'WhatsApp');
  btnWA.innerHTML = '<span class="kdf-action-icon" style="background:#25D366">' + ICO_WA + '</span><span>WhatsApp</span>';

  /* Chat with Us button */
  var btnChat = document.createElement('button');
  btnChat.className = 'kdf-action-btn';
  btnChat.setAttribute('aria-label', 'Chat with Us');
  btnChat.innerHTML = '<span class="kdf-action-icon" style="background:#1a1a2e">' + ICO_CHAT + '</span><span>Chat with Us</span>';

  stack.appendChild(btnWA);
  stack.appendChild(btnChat);

  /* Main FAB button */
  var fab    = document.createElement('button');
  fab.id     = 'kdf-fab-main';
  fab.setAttribute('aria-label', 'Open Chat Menu');
  fab.innerHTML = ICO_CHAT;

  var badge  = document.createElement('span');
  badge.id   = 'kdf-fab-badge';
  fab.appendChild(badge);

  /* Chat iframe popup */
  var popup  = document.createElement('iframe');
  popup.id   = 'kdf-chat-popup';
  popup.allow = 'microphone';
  popup.setAttribute('aria-label', 'KDF Nuts Chat');

  wrap.appendChild(stack);
  wrap.appendChild(fab);
  document.body.appendChild(popup);
  document.body.appendChild(wrap);

  /* ── State ──────────────────────────────────────────── */
  var stackOpen    = false;
  var chatOpen     = false;
  var iframeLoaded = false;

  /* ── Helpers ────────────────────────────────────────── */
  function sendContext() {
    if (!iframeLoaded) return;
    try {
      var shopifyCtx = null;
      if (cfg.customer) shopifyCtx = cfg.customer;
      popup.contentWindow.postMessage({
        type: 'KDF_SHOPIFY_CONTEXT',
        customer: shopifyCtx,
        cart:     cfg.cart || null,
        page:     window.location.href,
        pageTitle: document.title,
        store:    'shopify',
      }, '*');
    } catch (e) {}
  }

  function openStack() {
    stackOpen = true;
    stack.classList.add('kdf-visible');
    fab.setAttribute('data-open', '1');
    fab.innerHTML = ICO_CLOSE;
    fab.appendChild(badge);
    fab.setAttribute('aria-label', 'Close Menu');
  }

  function closeStack() {
    stackOpen = false;
    stack.classList.remove('kdf-visible');
    fab.removeAttribute('data-open');
    fab.innerHTML = ICO_CHAT;
    fab.appendChild(badge);
    fab.setAttribute('aria-label', 'Open Chat Menu');
  }

  function openChat() {
    if (!iframeLoaded) {
      popup.src = EMBED_URL;
      iframeLoaded = true;
      popup.onload = function () { sendContext(); };
    }
    chatOpen = true;
    popup.classList.add('kdf-open');
    setTimeout(sendContext, 400);
  }

  function closeChat() {
    chatOpen = false;
    popup.classList.remove('kdf-open');
  }

  /* ── Event handlers ─────────────────────────────────── */
  fab.addEventListener('click', function (e) {
    e.stopPropagation();
    if (stackOpen) {
      closeStack();
      if (chatOpen) closeChat();
    } else {
      openStack();
    }
  });

  btnChat.addEventListener('click', function (e) {
    e.stopPropagation();
    closeStack();
    if (chatOpen) {
      closeChat();
    } else {
      openChat();
    }
    fab.innerHTML = chatOpen ? ICO_CLOSE : ICO_CHAT;
    fab.appendChild(badge);
  });

  btnWA.addEventListener('click', function (e) {
    e.stopPropagation();
    closeStack();
    window.open(WA_HREF, '_blank', 'noopener,noreferrer');
  });

  /* Close stack when clicking outside */
  document.addEventListener('click', function (e) {
    if (stackOpen && !wrap.contains(e.target)) {
      closeStack();
    }
  });

  /* Handle close message from chat iframe */
  window.addEventListener('message', function (e) {
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'KDF_CLOSE') {
      closeChat();
      fab.innerHTML = ICO_CHAT;
      fab.appendChild(badge);
      fab.removeAttribute('data-open');
    }
    if (e.data.type === 'KDF_UNREAD') {
      var c = parseInt(e.data.count, 10) || 0;
      badge.textContent = c > 99 ? '99+' : String(c);
      badge.style.display = c > 0 ? 'flex' : 'none';
    }
  });

  /* Pulse animation after 3s */
  setTimeout(function () {
    fab.classList.add('kdf-pulse');
  }, 3000);

  /* ── Public API ─────────────────────────────────────── */
  window.KDFChat = {
    open:       function () { openStack(); },
    openChat:   function () { openStack(); openChat(); },
    close:      function () { closeStack(); closeChat(); },
    init:       function (c) { cfg = Object.assign({}, cfg, c); },
  };

})();
`;

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(js);
});

/* ═══════════════════════════════════════════════════════════
   GET /api/chat/shopify-install  — installation guide + snippet
═══════════════════════════════════════════════════════════ */
router.get("/chat/shopify-install", (req: Request, res: Response) => {
  const base      = getBaseUrl(req);
  const widgetUrl = `${base}/api/widget.js`;

  res.json({
    widgetUrl,
    liquidSnippet: `{%- comment -%} KDF NUTS Live Chat Widget v3 — paste before </body> {%- endcomment -%}

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

    steps: [
      "1. Shopify Admin → Online Store → Themes → Edit Code",
      "2. Open layout/theme.liquid",
      "3. Paste the Liquid Snippet just before the </body> tag",
      "4. Save → Preview your store",
      "5. Green chat button appears bottom-right — click to see Chat + WhatsApp stack",
      "6. WhatsApp button opens wa.me/923049996000 directly",
    ],
  });
});

export default router;
