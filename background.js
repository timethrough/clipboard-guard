"use strict";
const MAX_TEXT = 262144;
const EMPTY = { baseline: null, locked: false, blocked: 0 };
// A single queue prevents concurrent copy/lock/check updates from losing state.
let queue = Promise.resolve();
const ready = chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
const validText = text => typeof text === "string" && text.length > 0 && text.length <= MAX_TEXT;
async function digest(text) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
async function read() {
  return { ...EMPTY, ...(await chrome.storage.session.get("guardState")).guardState };
}
async function save(state) {
  await chrome.storage.session.set({ guardState: state });
  await chrome.action.setBadgeText({ text: state.locked ? "锁" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#147d66" });
}
async function handle(message, sender) {
  await ready;
  const popup = sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL("popup.html");
  const content = !popup && Boolean(sender.tab) && sender.id === chrome.runtime.id;
  if (!popup && !content) return { ok: false, reason: "unauthorized" };
  const state = await read();
  switch (message?.type) {
    case "STATE": return { ok: true, state };
    case "COPY":
    case "TRUST": {
      if (message.type === "TRUST" && !popup) return { ok: false, reason: "unauthorized" };
      if (!validText(message.text)) return { ok: false, reason: "invalid" };
      if (state.locked) return { ok: false, reason: "locked" };
      state.baseline = {
        hash: await digest(message.text), length: message.text.length, time: Date.now(),
        source: popup ? "在扩展内手动确认" : originOf(sender.url),
        id: crypto.randomUUID()
      };
      await save(state);
      return { ok: true, state };
    }
    case "CHECK": {
      if (!validText(message.text)) return { ok: false, reason: "invalid" };
      if (!state.baseline) return { ok: false, reason: "unknown" };
      const matches = state.baseline.hash === await digest(message.text);
      if (!matches) { state.blocked++; await save(state); }
      return { ok: matches, reason: matches ? "match" : "mismatch", state };
    }
    case "LOCK":
      if (!popup || typeof message.locked !== "boolean") return { ok: false, reason: "unauthorized" };
      if (message.locked && !state.baseline) return { ok: false, reason: "unknown" };
      state.locked = message.locked;
      await save(state);
      return { ok: true, state };
    case "CLEAR":
      if (!popup) return { ok: false, reason: "unauthorized" };
      await save({ ...EMPTY });
      return { ok: true, state: { ...EMPTY } };
    default: return { ok: false, reason: "unknown-message" };
  }
}
function originOf(url) { try { return new URL(url).origin; } catch { return "网页"; } }
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Relay only inside extension messaging. Clipboard plaintext never crosses a
  // page postMessage bridge and is never stored in the background or storage.
  if (message?.type === "PREVIEW_READ") {
    if (sender.id !== chrome.runtime.id || !sender.tab || sender.url !== chrome.runtime.getURL("preview.html")) {
      respond({ ok: false, reason: "unauthorized" });
      return false;
    }
    chrome.tabs.sendMessage(sender.tab.id, { type: "READ_PREVIEW" }, { frameId: 0 })
      .then(respond, () => respond({ ok: false, reason: "unavailable" }));
    return true;
  }
  const job = queue.then(() => handle(message, sender));
  queue = job.catch(() => {});
  job.then(respond, () => respond({ ok: false, reason: "unavailable" }));
  return true;
});
