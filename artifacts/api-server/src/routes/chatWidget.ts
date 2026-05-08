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

function host_is_dev(req: Request): boolean {
  const host = (req.headers["x-forwarded-host"] ?? req.headers.host ?? "") as string;
  return host.includes("replit") || host.includes("localhost") || host.includes("127.0.0.1");
}

/* ═══════════════════════════════════════════════════════════
   GET /api/chat-embed — standalone chat-only HTML page
   No kdf-nuts app, no storefront, pure chat UI
═══════════════════════════════════════════════════════════ */
router.get("/chat-embed", (req: Request, res: Response) => {
  const baseUrl = getBaseUrl(req);
  const apiUrl  = `${baseUrl}/api`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<title>KDF NUTS Chat</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f2f5;height:100vh;display:flex;flex-direction:column;overflow:hidden;}

  /* Header */
  #hdr{background:linear-gradient(135deg,#25D366,#128C7E);padding:12px 16px;display:flex;align-items:center;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,0.15);flex-shrink:0;}
  #hdr-avatar{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
  #hdr-info{flex:1;}
  #hdr-name{font-size:15px;font-weight:700;color:#fff;}
  #hdr-status{font-size:11px;color:rgba(255,255,255,0.85);display:flex;align-items:center;gap:4px;margin-top:1px;}
  #hdr-dot{width:7px;height:7px;border-radius:50%;background:#a5f3b4;animation:pulse 2s infinite;}
  #btn-close{background:rgba(255,255,255,0.2);border:none;color:#fff;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
  #btn-close:hover{background:rgba(255,255,255,0.35);}

  /* Messages area */
  #msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;scroll-behavior:smooth;}
  #msgs::-webkit-scrollbar{width:4px;}
  #msgs::-webkit-scrollbar-thumb{background:#ccc;border-radius:2px;}

  /* Bubbles */
  .bubble-wrap{display:flex;align-items:flex-end;gap:6px;}
  .bubble-wrap.me{flex-direction:row-reverse;}
  .avatar-sm{width:26px;height:26px;border-radius:50%;background:#25D366;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;flex-shrink:0;}
  .bubble{max-width:82%;padding:9px 12px;border-radius:16px;font-size:13.5px;line-height:1.45;word-break:break-word;position:relative;}
  .bubble.bot{background:#fff;color:#1a1a1a;border-bottom-left-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,0.1);}
  .bubble.me{background:#25D366;color:#fff;border-bottom-right-radius:4px;}
  .bubble-time{font-size:10px;opacity:0.6;margin-top:3px;text-align:right;}

  /* Typing indicator */
  #typing{display:none;align-items:flex-end;gap:6px;padding:2px 0;}
  #typing .bubble{background:#fff;padding:10px 14px;}
  .dot{width:7px;height:7px;border-radius:50%;background:#999;animation:bounce 1.4s infinite;}
  .dot:nth-child(2){animation-delay:.2s;}
  .dot:nth-child(3){animation-delay:.4s;}
  @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}

  /* Lead form */
  #lead-form{background:#fff;margin:8px;border-radius:14px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08);}
  #lead-form h3{font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:4px;}
  #lead-form p{font-size:12px;color:#666;margin-bottom:12px;}
  .lf-input{width:100%;border:1.5px solid #e5e7eb;border-radius:10px;padding:10px 12px;font-size:13px;outline:none;transition:border-color .2s;margin-bottom:8px;}
  .lf-input:focus{border-color:#25D366;}
  #btn-lead{width:100%;background:#25D366;color:#fff;border:none;border-radius:10px;padding:11px;font-size:14px;font-weight:600;cursor:pointer;transition:background .2s;}
  #btn-lead:hover{background:#128C7E;}
  #lead-skip{display:block;text-align:center;font-size:12px;color:#999;margin-top:8px;cursor:pointer;text-decoration:underline;}

  /* Input area */
  #input-area{background:#fff;padding:8px 10px;display:flex;align-items:center;gap:8px;border-top:1px solid #f0f2f5;flex-shrink:0;}
  #msg-input{flex:1;border:1.5px solid #e5e7eb;border-radius:22px;padding:9px 14px;font-size:13.5px;outline:none;resize:none;max-height:90px;overflow-y:auto;transition:border-color .2s;font-family:inherit;}
  #msg-input:focus{border-color:#25D366;}
  #btn-send{width:38px;height:38px;border-radius:50%;background:#25D366;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background .2s;}
  #btn-send:hover{background:#128C7E;}
  #btn-send:disabled{background:#ccc;cursor:not-allowed;}
  #btn-wa{background:#fff;border:1.5px solid #25D366;color:#25D366;border-radius:20px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;transition:all .2s;white-space:nowrap;}
  #btn-wa:hover{background:#25D366;color:#fff;}

  /* Quick chips */
  #chips{display:flex;gap:6px;padding:0 10px 8px;overflow-x:auto;flex-shrink:0;}
  #chips::-webkit-scrollbar{display:none;}
  .chip{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:5px 11px;font-size:12px;color:#374151;cursor:pointer;white-space:nowrap;transition:all .2s;}
  .chip:hover{background:#25D366;color:#fff;border-color:#25D366;}

  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .bubble-wrap{animation:fadeIn .25s ease;}
</style>
</head>
<body>

<!-- Header -->
<div id="hdr">
  <div id="hdr-avatar">🌰</div>
  <div id="hdr-info">
    <div id="hdr-name">KDF NUTS Support</div>
    <div id="hdr-status"><span id="hdr-dot"></span> Online — 24/7 Live Support</div>
  </div>
  <button id="btn-close" title="Close" aria-label="Close chat">✕</button>
</div>

<!-- Messages -->
<div id="msgs"></div>

<!-- Typing indicator -->
<div id="typing" class="bubble-wrap">
  <div class="avatar-sm">K</div>
  <div class="bubble bot" style="display:flex;gap:4px;padding:12px 14px;">
    <span class="dot"></span><span class="dot"></span><span class="dot"></span>
  </div>
</div>

<!-- Lead capture form (shown first) -->
<div id="lead-form">
  <h3>👋 Welcome to KDF NUTS!</h3>
  <p>Share your name & number to start chatting with our team.</p>
  <input class="lf-input" id="lf-name" type="text" placeholder="Your name *" autocomplete="name">
  <input class="lf-input" id="lf-phone" type="tel" placeholder="Phone number * (03xx-xxxxxxx)" autocomplete="tel">
  <input class="lf-input" id="lf-email" type="email" placeholder="Email (optional)" autocomplete="email">
  <button id="btn-lead">Start Chat →</button>
  <span id="lead-skip">Skip for now</span>
</div>

<!-- Quick chips -->
<div id="chips" style="display:none;">
  <span class="chip" data-msg="What products do you have?">🛒 Products</span>
  <span class="chip" data-msg="What are your prices?">💰 Prices</span>
  <span class="chip" data-msg="How long is delivery?">🚚 Delivery</span>
  <span class="chip" data-msg="I want to place an order">📦 Order</span>
  <span class="chip" data-msg="I need human support">👤 Human Support</span>
</div>

<!-- Input area -->
<div id="input-area" style="display:none;">
  <textarea id="msg-input" rows="1" placeholder="Type your message..." autocomplete="off"></textarea>
  <button id="btn-wa" onclick="window.open('https://wa.me/923049996000?text=Hello%20I%20need%20help','_blank')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.963 2C6.466 2 2 6.466 2 11.963c0 1.82.49 3.524 1.345 4.989L2 22l5.217-1.319A9.925 9.925 0 0011.963 22C17.46 22 22 17.534 22 12.037 22 6.54 17.46 2 11.963 2zm0 18.12a8.168 8.168 0 01-4.152-1.132l-.297-.177-3.095.782.812-3.006-.198-.31A8.12 8.12 0 013.88 12.037c0-4.46 3.624-8.085 8.083-8.085 4.46 0 8.084 3.624 8.084 8.085 0 4.46-3.624 8.083-8.084 8.083z"/></svg>
    WA
  </button>
  <button id="btn-send" aria-label="Send">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
  </button>
</div>

<script>
(function() {
  var API = ${JSON.stringify(apiUrl)};
  var sessionId = localStorage.getItem('kdf_embed_session') || ('embed_' + Date.now() + '_' + Math.random().toString(36).slice(2,7));
  var leadSaved = localStorage.getItem('kdf_embed_lead') === '1';

  localStorage.setItem('kdf_embed_session', sessionId);

  var msgs   = document.getElementById('msgs');
  var input  = document.getElementById('msg-input');
  var btnSend= document.getElementById('btn-send');
  var typing = document.getElementById('typing');
  var chips  = document.getElementById('chips');
  var inputArea = document.getElementById('input-area');
  var leadForm  = document.getElementById('lead-form');

  /* ── Close button → postMessage to parent widget ── */
  document.getElementById('btn-close').addEventListener('click', function() {
    try { window.parent.postMessage({ type: 'KDF_CLOSE' }, '*'); } catch(e) {}
  });

  /* ── Helpers ── */
  function fmtTime() {
    return new Date().toLocaleTimeString('en-PK',{hour:'2-digit',minute:'2-digit',hour12:true});
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

    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function showTyping(show) {
    typing.style.display = show ? 'flex' : 'none';
    if (show) msgs.scrollTop = msgs.scrollHeight;
  }

  /* ── Send message ── */
  async function sendMessage(text) {
    if (!text.trim()) return;
    input.value = '';
    input.style.height = 'auto';
    btnSend.disabled = true;
    addBubble(text, 'user');
    showTyping(true);

    try {
      var res = await fetch(API + '/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, message: text })
      });
      var data = await res.json();
      showTyping(false);

      var reply = data.reply || data.message || data.text || (data.error ? '❌ ' + data.error : 'Sorry, I could not process that.');
      addBubble(reply, 'bot');
    } catch(e) {
      showTyping(false);
      addBubble('⚠️ Connection error. Please try WhatsApp instead.', 'bot');
    }
    btnSend.disabled = false;
    input.focus();
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
    input.focus();
    /* Welcome message */
    setTimeout(function() {
      addBubble('Assalam o Alaikum! 🌰 Welcome to KDF NUTS. Mujhe batayein main aapki kaise madad kar sakta hoon? Apna order place karein ya koi bhi sawal poochhein!', 'bot');
    }, 300);
  }

  function submitLead() {
    var name  = document.getElementById('lf-name').value.trim();
    var phone = document.getElementById('lf-phone').value.trim();
    var email = document.getElementById('lf-email').value.trim();
    if (!name || !phone) {
      document.getElementById('lf-name').style.borderColor = name ? '#e5e7eb' : '#ef4444';
      document.getElementById('lf-phone').style.borderColor = phone ? '#e5e7eb' : '#ef4444';
      return;
    }
    localStorage.setItem('kdf_embed_lead', '1');
    /* Save lead to API (non-blocking) */
    fetch(API + '/chat/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, phone: phone, email: email || undefined, source: 'shopify_widget', sessionId: sessionId })
    }).catch(function(){});
    showChatInterface();
  }

  document.getElementById('btn-lead').addEventListener('click', submitLead);
  document.getElementById('lf-phone').addEventListener('keydown', function(e){ if(e.key==='Enter') submitLead(); });
  document.getElementById('lead-skip').addEventListener('click', function() {
    localStorage.setItem('kdf_embed_lead', '1');
    showChatInterface();
  });

  /* ── Auto-show chat if lead already captured ── */
  if (leadSaved) {
    showChatInterface();
  }

})();
</script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
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
  const baseUrl   = getBaseUrl(req);
  const embedUrl  = `${baseUrl}/api/chat-embed`;
  const WA_NUMBER = "923049996000";
  const WA_MSG    = encodeURIComponent("Hello! I need help with my order.");
  const WA_URL    = `https://wa.me/${WA_NUMBER}?text=${WA_MSG}`;

  const js = `/* KDF NUTS Chat Widget v3.1 — Floating Action Stack */
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
    #kdf-w *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
    #kdf-w{position:fixed;bottom:20px;right:20px;z-index:2147483640;display:flex;flex-direction:column;align-items:flex-end;gap:10px;}
    #kdf-fab{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;background:#25D366;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 22px rgba(37,211,102,0.45);transition:transform .2s,box-shadow .2s;-webkit-tap-highlight-color:transparent;position:relative;}
    #kdf-fab:hover{transform:scale(1.08);}
    #kdf-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;border-radius:9px;display:none;align-items:center;justify-content:center;padding:0 4px;border:2px solid #fff;}
    .kdf-ab{display:flex;align-items:center;gap:9px;background:#fff;border:none;border-radius:28px;padding:8px 16px 8px 8px;cursor:pointer;box-shadow:0 3px 16px rgba(0,0,0,0.16);white-space:nowrap;font-size:13.5px;font-weight:600;color:#1a1a2e;transition:transform .15s,box-shadow .15s;-webkit-tap-highlight-color:transparent;}
    .kdf-ab:hover{transform:translateX(-3px);box-shadow:0 5px 22px rgba(0,0,0,0.2);}
    .kdf-ai{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
    #kdf-stack{display:flex;flex-direction:column;align-items:flex-end;gap:9px;transition:opacity .2s,transform .2s;opacity:0;transform:translateY(8px) scale(0.95);pointer-events:none;}
    #kdf-stack.kdf-vis{opacity:1;transform:none;pointer-events:auto;}
    #kdf-popup{position:fixed;bottom:90px;right:20px;width:360px;height:560px;border:none;border-radius:20px;box-shadow:0 16px 56px rgba(0,0,0,0.22);z-index:2147483641;display:none;opacity:0;transform:translateY(10px) scale(0.97);transition:opacity .25s,transform .25s;}
    #kdf-popup.kdf-open{display:block;opacity:1;transform:none;}
    @media(max-width:480px){
      #kdf-w{bottom:14px;right:14px;}
      #kdf-popup{bottom:0;right:0;width:100%;height:82vh;border-radius:20px 20px 0 0;}
    }
    @keyframes kdfP{0%,100%{box-shadow:0 4px 22px rgba(37,211,102,0.45)}50%{box-shadow:0 4px 36px rgba(37,211,102,0.72)}}
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
  bWA.innerHTML = '<span class="kdf-ai" style="background:#25D366">' + I_WA + '</span><span>WhatsApp</span>';

  var bChat = document.createElement('button'); bChat.className = 'kdf-ab'; bChat.setAttribute('aria-label','Chat with Us');
  bChat.innerHTML = '<span class="kdf-ai" style="background:#1a1a2e">' + I_CHAT + '</span><span>Chat with Us</span>';

  stack.appendChild(bWA);
  stack.appendChild(bChat);

  var fab   = document.createElement('button'); fab.id = 'kdf-fab'; fab.setAttribute('aria-label','Open Chat');
  fab.innerHTML = I_CHAT;
  var badge = document.createElement('span'); badge.id = 'kdf-badge'; fab.appendChild(badge);

  var popup = document.createElement('iframe'); popup.id = 'kdf-popup'; popup.allow = 'microphone';
  popup.setAttribute('aria-label','KDF NUTS Chat');

  wrap.appendChild(stack); wrap.appendChild(fab);
  document.body.appendChild(popup); document.body.appendChild(wrap);

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
  res.setHeader("Cache-Control", "public, max-age=60");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(js);
});

/* ═══════════════════════════════════════════════════════════
   GET /api/chat/shopify-install — installation guide
═══════════════════════════════════════════════════════════ */
router.get("/chat/shopify-install", (req: Request, res: Response) => {
  const base      = getBaseUrl(req);
  const widgetUrl = `${base}/api/widget.js`;
  const embedUrl  = `${base}/api/chat-embed`;

  res.json({
    widgetUrl,
    embedUrl,
    liquidSnippet: `{%- comment -%} KDF NUTS Live Chat Widget v3.1 — paste before </body> {%- endcomment -%}

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

    steps: [
      "1. Shopify Admin → Online Store → Themes → Edit Code",
      "2. Open layout/theme.liquid",
      "3. Paste the Liquid Snippet just before the </body> tag",
      "4. Save → Preview your store",
      "5. Green chat button appears bottom-right (no storefront inside widget)",
      "6. 'Chat with Us' opens a clean, compact chat popup",
      "7. 'WhatsApp' opens wa.me/923049996000 directly",
    ],
  });
});

export default router;
