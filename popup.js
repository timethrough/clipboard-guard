"use strict";
const $ = id => document.getElementById(id);
let state;
const send = message => chrome.runtime.sendMessage(message);
function message(text, error = false) { $("message").textContent = text; $("message").className = error ? "error" : "success"; }
function render(next) {
  state = next;
  $("baseline").textContent = state.baseline ? `已记录 ${state.baseline.length} 个字符 · ${new Date(state.baseline.time).toLocaleTimeString()}` : "尚未记录复制内容";
  $("source").textContent = state.baseline ? `来源：${state.baseline.source}` : "在网页选中文本后按 Ctrl+C，即可创建核对记录。";
  $("lockState").textContent = state.locked ? "已锁定" : "未锁定";
  $("lock").textContent = state.locked ? "解除锁定" : "锁定记录";
  $("lock").disabled = !state.baseline;
  $("trust").disabled = state.locked;
  $("blocked").textContent = `不一致检测：${state.blocked} 次`;
}
function explain(result) {
  if (result.state) render(result.state);
  const descriptions = { mismatch: "不一致：请检查完整文本。可能被替换，也可能来自一次新的复制。", unknown: "没有核对记录，无法判断是否被替换。", locked: "请先解除锁定，再更新核对记录。", invalid: "请输入 1 至 262,144 个字符的文本。" };
  message(result.ok ? "内容与核对记录完全一致。" : descriptions[result.reason] || "操作未完成，请重新打开扩展。", !result.ok);
}
async function guarded(fn) { try { await fn(); } catch { message("操作失败。请确认剪贴板权限，或刷新网页后重试。", true); } }
$("lock").addEventListener("click", () => guarded(async () => {
  const result = await send({ type: "LOCK", locked: !state?.locked });
  if (result.ok) { render(result.state); message(result.state.locked ? "核对记录已锁定。" : "已解除锁定。下一次网页复制会更新记录。"); } else explain(result);
}));
$("clear").addEventListener("click", () => guarded(async () => {
  const result = await send({ type: "CLEAR" });
  if (result.ok) { render(result.state); $("text").value = ""; details(); message("核对记录已清除；系统剪贴板未改变。"); } else explain(result);
}));
function details() {
  const value = $("text").value;
  const invisible = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(value);
  const whitespace = value !== value.trim();
  $("details").textContent = `${value.length} 个字符${whitespace ? " · 首尾有空白" : ""}${invisible ? " · 含不可见/方向控制字符，请仔细核实" : ""}；逐字符核对，不忽略空白或大小写。`;
}
$("text").addEventListener("input", details);
$("read").addEventListener("click", () => guarded(async () => {
  $("text").value = await navigator.clipboard.readText(); details();
  explain(await send({ type: "CHECK", text: $("text").value }));
}));
$("check").addEventListener("click", () => guarded(async () => { details(); explain(await send({ type: "CHECK", text: $("text").value })); }));
$("trust").addEventListener("click", () => guarded(async () => {
  const text = $("text").value;
  const result = await send({ type: "TRUST", text });
  if (!result.ok) { explain(result); return; }
  render(result.state);
  await navigator.clipboard.writeText(text);
  const check = await navigator.clipboard.readText();
  if (check !== text) { message("已建立记录，但写入后剪贴板立即变化。请检查系统或其他扩展。", true); return; }
  message("已将你确认的文本记为可信并复制。重要地址可继续点击“锁定记录”。");
}));
chrome.storage.onChanged.addListener((changes, area) => { if (area === "session" && changes.guardState?.newValue) render(changes.guardState.newValue); });
guarded(async () => {
  const result = await send({ type: "STATE" });
  if (result.ok) render(result.state); else explain(result);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const reply = await chrome.tabs.sendMessage(tab.id, { type: "PING" }, { frameId: 0 });
    if (!reply?.ok) throw new Error("No guard");
    $("coverage").textContent = "当前页面已连接粘贴校验。网页脚本写入拦截为尽力防护。";
  } catch {
    $("coverage").textContent = "当前页面未连接防护。普通网页请刷新；浏览器内部页、商店页及 PDF 等不支持。";
    $("coverage").classList.add("warn");
  }
});
