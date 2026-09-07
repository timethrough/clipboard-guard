"use strict";
(() => {
  const handle = document.getElementById("drag-handle");
  const restore = document.getElementById("restore");
  let drag;
  let suppressClick = false;
  const send = data => window.parent.postMessage({ type: "CG_PREVIEW_POSITION", ...data }, "*");
  for (const element of [handle, restore]) {
    element.addEventListener("pointerdown", event => {
      if (!event.isTrusted || event.button !== 0 || !event.isPrimary) return;
      suppressClick = false;
      drag = { id: event.pointerId, x: event.screenX, y: event.screenY, moved: false };
      element.setPointerCapture(event.pointerId);
      element.focus({ preventScroll: true });
      document.body.classList.add("dragging");
      send({ action: "start", x: event.screenX, y: event.screenY });
      event.preventDefault();
    });
    element.addEventListener("pointermove", event => {
      if (!event.isTrusted || !drag || drag.id !== event.pointerId) return;
      if (Math.hypot(event.screenX - drag.x, event.screenY - drag.y) < 3 && !drag.moved) return;
      drag.moved = true;
      // Screen coordinates remain stable as the enclosing iframe moves.
      send({ action: "move", x: event.screenX, y: event.screenY });
    });
    const end = event => {
      if (!drag || event.pointerId !== drag.id) return;
      suppressClick = drag.moved;
      if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      drag = null;
      document.body.classList.remove("dragging");
      send({ action: "end" });
    };
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
    element.addEventListener("lostpointercapture", end);
    element.addEventListener("click", event => {
      if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
    }, true);
  }
  handle.addEventListener("dblclick", event => { if (event.isTrusted) send({ action: "reset" }); });
  window.addEventListener("message", event => {
    if (event.source !== window.parent || !drag) return;
    if (event.data?.type === "CG_PREVIEW_DRAG_MOVED") { drag.moved = true; return; }
    if (event.data?.type !== "CG_PREVIEW_DRAG_FINISHED") return;
    suppressClick = true;
    drag = null;
    document.body.classList.remove("dragging");
  });
  handle.addEventListener("keydown", event => {
    if (!event.isTrusted) return;
    const step = event.shiftKey ? 40 : 10;
    const offsets = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (event.key === "Home") { event.preventDefault(); send({ action: "reset" }); }
    else if (Object.hasOwn(offsets, event.key)) { event.preventDefault(); const [x, y] = offsets[event.key]; send({ action: "nudge", x, y }); }
  });
})();
