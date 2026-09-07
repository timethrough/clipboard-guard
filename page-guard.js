/* Best-effort MAIN-world mitigation. This is not an OS security boundary. */
(() => {
  "use strict";
  const define = Object.defineProperty;
  const apply = Reflect.apply;
  const reject = Promise.reject.bind(Promise);
  const Denied = DOMException;
  const denyWrite = () => reject(new Denied("剪贴板守卫：请选中文本后按 Ctrl+C。", "NotAllowedError"));
  const protect = (object, key, value) => {
    try { define(object, key, { value, writable: false, configurable: false }); } catch { /* Unsupported/frozen API. */ }
  };
  if (typeof Clipboard !== "undefined") {
    protect(Clipboard.prototype, "writeText", denyWrite);
    protect(Clipboard.prototype, "write", denyWrite);
  }
  if (navigator.clipboard) {
    protect(navigator.clipboard, "writeText", denyWrite);
    protect(navigator.clipboard, "write", denyWrite);
  }
  const exec = Document.prototype.execCommand;
  const lower = Function.call.bind(String.prototype.toLowerCase);
  const trim = Function.call.bind(String.prototype.trim);
  if (exec) protect(Document.prototype, "execCommand", function(command, ...args) {
    const name = typeof command === "string" ? lower(trim(command)) : "";
    if (name === "copy" || name === "cut") return false;
    return apply(exec, this, [command, ...args]);
  });
})();
