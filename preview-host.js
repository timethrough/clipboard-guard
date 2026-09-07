(() => {
  "use strict";
  if (window !== window.top) return;
  const previewUrl = chrome.runtime.getURL("preview.html");
  const extensionOrigin = new URL(previewUrl).origin;
  let frame;
  let host;
  let position;
  let drag;
  function place(x, y) {
    const rect = frame.getBoundingClientRect();
    const margin = 8;
    position = {
      x: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      y: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin))
    };
    host.style.setProperty("right", "auto", "important");
    host.style.setProperty("bottom", "auto", "important");
    host.style.setProperty("left", `${position.x}px`, "important");
    host.style.setProperty("top", `${position.y}px`, "important");
  }
  function reset() {
    drag = null;
    position = null;
    host.style.setProperty("left", "auto", "important");
    host.style.setProperty("top", "auto", "important");
    host.style.setProperty("right", "16px", "important");
    host.style.setProperty("bottom", "16px", "important");
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.type !== "READ_PREVIEW") return;
    if (document.visibilityState !== "visible" || !document.hasFocus()) {
      respond({ ok: false, reason: "inactive" }); return false;
    }
    if (!navigator.clipboard?.readText) {
      respond({ ok: false, reason: "unsupported" }); return false;
    }
    navigator.clipboard.readText().then(text => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) {
        respond({ ok: false, reason: "inactive" }); return;
      }
      respond({ ok: true, text: text.slice(0, 4096), length: text.length, time: Date.now() });
    }, () => respond({ ok: false, reason: "denied" }));
    return true;
  });
  function mount() {
    host = document.createElement("div");
    host.style.cssText = "all:initial!important;position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483646!important;display:block!important;line-height:0!important";
    const shadow = host.attachShadow({ mode: "closed" });
    frame = document.createElement("iframe");
    frame.src = previewUrl;
    frame.title = "剪贴板守卫 · 当前剪贴板";
    frame.style.cssText = "border:0;display:block;width:min(440px,calc(100vw - 32px));height:min(152px,calc(100vh - 32px));border-radius:14px;box-shadow:0 8px 32px #0004;color-scheme:dark;";
    shadow.append(frame);
    document.documentElement.append(host);
  }
  window.addEventListener("message", event => {
    // This bridge carries layout ONLY, never clipboard text or trust commands.
    if (!frame || event.source !== frame.contentWindow || event.origin !== extensionOrigin) return;
    const data = event.data;
    if (data?.type === "CG_PREVIEW_POSITION") {
      const point = Number.isFinite(data.x) && Number.isFinite(data.y);
      if (data.action === "start" && point) {
        const rect = frame.getBoundingClientRect();
        drag = { x: rect.x, y: rect.y, screenX: data.x, screenY: data.y };
      } else if (data.action === "move" && drag && point) {
        place(drag.x + data.x - drag.screenX, drag.y + data.y - drag.screenY);
      } else if (data.action === "end") drag = null;
      else if (data.action === "reset") reset();
      else if (data.action === "nudge" && point && Math.abs(data.x) <= 40 && Math.abs(data.y) <= 40) {
        const rect = frame.getBoundingClientRect(); place(rect.x + data.x, rect.y + data.y);
      }
      return;
    }
    if (data?.type !== "CG_PREVIEW_SIZE") return;
    const sizes = { compact: [440, 152], expanded: [440, 280], collapsed: [150, 44] };
    const size = Object.hasOwn(sizes, data.mode) && sizes[data.mode];
    if (!size) return;
    frame.style.width = `min(${size[0]}px,calc(100vw - 32px))`;
    frame.style.height = `min(${size[1]}px,calc(100vh - 32px))`;
    drag = null;
    if (position) place(position.x, position.y);
  });
  window.addEventListener("resize", () => {
    drag = null;
    if (frame && position) place(position.x, position.y);
  });
  // Chromium can route mouse events to the top document when a captured pointer
  // leaves a cross-origin frame. Continue the same drag in that document.
  window.addEventListener("pointermove", event => {
    if (!drag || !event.isTrusted) return;
    if (!(event.buttons & 1)) { drag = null; return; }
    if (Math.hypot(event.screenX - drag.screenX, event.screenY - drag.screenY) < 3 && !drag.moved) return;
    if (!drag.moved) {
      drag.moved = true;
      frame.contentWindow.postMessage({ type: "CG_PREVIEW_DRAG_MOVED" }, extensionOrigin);
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    place(drag.x + event.screenX - drag.screenX, drag.y + event.screenY - drag.screenY);
  }, true);
  window.addEventListener("pointerup", event => {
    if (!drag || !event.isTrusted) return;
    drag = null;
    event.preventDefault();
    event.stopImmediatePropagation();
    frame.contentWindow.postMessage({ type: "CG_PREVIEW_DRAG_FINISHED" }, extensionOrigin);
  }, true);
  if (document.documentElement) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
