"use strict";
const $ = id => document.getElementById(id);
let mode = "compact";
let busy = false;
let generation = 0;
let lastText;
let lastLength;
let lastChanged = 0;
function resize(next) {
  mode = next;
  generation++;
  document.body.classList.toggle("expanded", next === "expanded");
  document.body.classList.toggle("collapsed", next === "collapsed");
  $("panel").hidden = next === "collapsed";
  $("restore").hidden = next !== "collapsed";
  $("expand").textContent = next === "expanded" ? "收起详情" : "展开";
  window.parent.postMessage({ type: "CG_PREVIEW_SIZE", mode: next }, "*");
}
function render(result) {
  if (!result?.ok) {
    document.body.classList.add("paused");
    $("status").textContent = result?.reason === "inactive" ? "已暂停 · 当前显示上次读取内容" : "未能更新 · 点击刷新重试";
    if (lastText === undefined) $("text").textContent = "点击刷新，读取当前剪贴板";
    return;
  }
  const changed = lastText !== undefined && (lastText !== result.text || lastLength !== result.length);
  if (changed) lastChanged = Date.now();
  lastText = result.text;
  lastLength = result.length;
  document.body.classList.remove("paused");
  $("dot").classList.toggle("changed", Date.now() - lastChanged < 5000);
  $("text").textContent = result.length ? result.text : "（剪贴板为空或无文本）";
  $("count").textContent = `${result.length} 字符`;
  const time = new Date(result.time).toLocaleTimeString("zh-CN", { hour12: false });
  $("status").textContent = `${Date.now() - lastChanged < 5000 ? "内容已变化 · " : ""}${time} 更新${result.length > 4096 ? " · 仅预览前 4096 字符" : ""}`;
}
async function refresh(manual = false) {
  if (busy || mode === "collapsed" || document.visibilityState !== "visible") return;
  busy = true;
  const current = generation;
  try {
    let result;
    // A user click focuses this extension-origin frame, including on HTTP sites.
    if (manual && document.hasFocus() && navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      result = { ok: true, text: text.slice(0, 4096), length: text.length, time: Date.now() };
    } else {
      result = await chrome.runtime.sendMessage({ type: "PREVIEW_READ" });
    }
    if (current === generation) render(result);
  } catch { if (current === generation) render({ ok: false }); }
  finally { busy = false; }
}
$("refresh").addEventListener("click", () => refresh(true));
$("expand").addEventListener("click", () => { resize(mode === "expanded" ? "compact" : "expanded"); refresh(true); });
$("collapse").addEventListener("click", () => {
  resize("collapsed");
  lastText = undefined; lastLength = undefined;
  $("text").textContent = "已暂停读取"; $("count").textContent = "";
});
$("restore").addEventListener("click", () => { resize("compact"); refresh(true); });
window.addEventListener("focus", () => refresh());
document.addEventListener("visibilitychange", () => {
  generation++;
  if (document.visibilityState === "visible") refresh();
  else render({ ok: false, reason: "inactive" });
});
setInterval(() => refresh(), 1000);
refresh();
