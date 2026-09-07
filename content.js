(() => {
  "use strict";
  const MAX_TEXT = 262144;
  let copyPending = Promise.resolve();
  let revision = 0;
  let noticeHost;
  let noticeTimer;
  const send = message => chrome.runtime.sendMessage(message);
  function activeElement() {
    let node = document.activeElement;
    while (node?.shadowRoot?.activeElement) node = node.shadowRoot.activeElement;
    return node;
  }
  function selectedText() {
    const node = activeElement();
    if (node instanceof HTMLInputElement && node.type === "password") return null;
    if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
      if (typeof node.selectionStart === "number") return node.value.slice(node.selectionStart, node.selectionEnd);
    }
    return window.getSelection()?.toString() || "";
  }
  function notify(message, danger = false) {
    clearTimeout(noticeTimer);
    noticeHost?.remove();
    noticeHost = document.createElement("div");
    noticeHost.style.cssText = "all:initial!important;position:fixed!important;right:20px!important;top:20px!important;z-index:2147483647!important;display:block!important";
    const root = noticeHost.attachShadow({ mode: "closed" });
    const box = document.createElement("div");
    box.style.cssText = `font:14px/1.65 system-ui,sans-serif;max-width:360px;padding:16px 20px;border-radius:14px;color:white;background:${danger ? "#9d2d39" : "#125d50"};box-shadow:0 6px 32px #0005;white-space:pre-wrap;`;
    box.textContent = "剪贴板守卫\n" + message;
    box.setAttribute("role", danger ? "alert" : "status");
    root.append(box);
    (document.body || document.documentElement)?.append(noticeHost);
    noticeTimer = setTimeout(() => noticeHost?.remove(), 6500);
  }
  function captureCopy(event) {
    if (!event.isTrusted) return;
    revision++;
    // Stop page copy handlers before they can replace the selected text.
    event.stopImmediatePropagation();
    const text = selectedText();
    if (text === null) return; // Never record password-field selections.
    if (!text || text.length > MAX_TEXT || !event.clipboardData) {
      // Do not create an unverified clipboard value when selection is inaccessible.
      event.preventDefault();
      notify("未复制：请选中可读取的纯文本（最多 262,144 个字符）。", true);
      return;
    }
    if (event.type === "copy") {
      event.preventDefault();
      event.clipboardData.setData("text/plain", text);
    }
    // For cut, leave the browser default intact, so deletion/undo remain native.
    copyPending = copyPending.catch(() => {}).then(() => send({ type: "COPY", text })).then(result => {
      if (result.ok) notify("已记录复制内容；粘贴时会核对。" );
      else if (result.reason === "locked") notify("已复制，但核对记录已锁定。新内容与锁定记录不一致时会被拦截。", true);
      else notify("复制内容未能登记；请刷新页面后重新复制。", true);
    }).catch(() => notify("扩展连接已中断，请刷新页面后重新复制。", true));
  }
  function snapshotTarget(event) {
    const target = event.composedPath()[0];
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      if (target.disabled || target.readOnly || typeof target.selectionStart !== "number") return null;
      return { target, value: target.value, start: target.selectionStart, end: target.selectionEnd, kind: "input" };
    }
    if (target instanceof HTMLElement && target.isContentEditable) {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return null;
      const range = selection.getRangeAt(0).cloneRange();
      return { target, range, html: target.innerHTML, kind: "editable" };
    }
    return null;
  }
  function unchanged(snapshot) {
    if (!snapshot.target.isConnected || !document.hasFocus()) return false;
    if (snapshot.kind === "input") return activeElement() === snapshot.target && snapshot.value === snapshot.target.value && snapshot.start === snapshot.target.selectionStart && snapshot.end === snapshot.target.selectionEnd;
    const selection = window.getSelection();
    if (!selection?.rangeCount || snapshot.html !== snapshot.target.innerHTML) return false;
    const range = selection.getRangeAt(0);
    return range.startContainer === snapshot.range.startContainer && range.endContainer === snapshot.range.endContainer && range.startOffset === snapshot.range.startOffset && range.endOffset === snapshot.range.endOffset;
  }
  async function verifyPaste(event) {
    if (!event.isTrusted) return;
    // Prevent both default insertion and page paste handlers until verification finishes.
    event.preventDefault();
    event.stopImmediatePropagation();
    const myRevision = ++revision;
    const text = event.clipboardData?.getData("text/plain") || "";
    const snapshot = snapshotTarget(event);
    if (!text || text.length > MAX_TEXT) { notify("已拦截：仅支持不超过 262,144 字符的纯文本粘贴。", true); return; }
    try {
      await copyPending;
      const result = await send({ type: "CHECK", text });
      if (!result.ok) {
        const messages = {
          mismatch: "已拦截粘贴：内容与核对记录不一致。可能被替换，也可能是在其他程序复制了新内容。请点扩展图标核对。",
          unknown: "尚无核对记录。请先在网页选中文本并按 Ctrl+C，或在扩展中手动确认可信内容。"
        };
        notify(messages[result.reason] || "校验未完成，已阻止粘贴。请刷新页面后重试。", true);
        return;
      }
      if (!snapshot) { notify("内容一致，但此编辑器不支持安全插入。请使用普通文本框。", true); return; }
      if (myRevision !== revision || !unchanged(snapshot)) { notify("校验期间焦点或内容改变，请重新粘贴。", true); return; }
      // The isolated world's native command is separate from the page's patched API.
      // insertText keeps browser undo and standard input events; never insert HTML.
      if (!document.execCommand("insertText", false, text)) notify("内容一致，但此编辑器拒绝插入。请使用普通文本框。", true);
    } catch { notify("扩展不可用，已阻止粘贴。请刷新页面后重试。", true); }
  }
  for (const name of ["copy", "cut"]) window.addEventListener(name, captureCopy, true);
  window.addEventListener("paste", verifyPaste, true);
  for (const name of ["keydown", "pointerdown", "beforeinput", "focusout"]) window.addEventListener(name, () => { revision++; }, true);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === "PING") respond({ ok: true });
  });
})();
