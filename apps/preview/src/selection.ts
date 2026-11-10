import type { SelectedElement } from "@appbuilder/contract";

/**
 * Click-to-select inside the preview. While enabled, pointer input is captured before the
 * app sees it (so buttons don't fire), the element under the pointer with a `data-fid` is
 * outlined, and a click reports it to the parent.
 */
export function createSelection(
  onSelect: (element: SelectedElement) => void,
  literalTextFor: (fid: string) => string | null = () => null,
  onTextEdit: (fid: string, text: string) => void = () => undefined,
) {
  let enabled = false;
  let textEditing = false;
  let editing: HTMLElement | null = null;
  const hover = makeOverlay("2px dashed #3b82f6", "rgba(59,130,246,0.08)");
  const selected = makeOverlay("2px solid #2563eb", "rgba(37,99,235,0.12)");
  let selectedEl: Element | null = null;

  const target = (event: Event): HTMLElement | null =>
    (event.target as Element | null)?.closest?.("[data-fid]") as HTMLElement | null;

  const swallow = (event: Event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const onMove = (event: Event) => {
    if (!enabled) return;
    place(hover, target(event));
  };

  const select = (el: HTMLElement) => {
    selectedEl = el;
    place(selected, el);
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    onSelect({
      fid: el.dataset.fid!,
      literalText: literalTextFor(el.dataset.fid!),
      text: (el.textContent ?? "").trim().slice(0, 80),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      style: {
        color: style.color,
        backgroundColor: style.backgroundColor,
        fontSize: style.fontSize,
        padding: style.padding,
      },
    });
  };

  const onClick = (event: Event) => {
    if (!enabled) return;
    swallow(event);
    const el = target(event);
    if (el) select(el);
  };

  /**
   * Type over the element's text right on the screen: Enter (or clicking away) saves through
   * the parent, Escape puts the old text back. Keys never reach the app (a focused button
   * would otherwise press on Enter or Space).
   */
  const editInPlace = (el: HTMLElement, original: string) => {
    editing = el;
    const before = {
      outline: el.style.outline,
      offset: el.style.outlineOffset,
      cursor: el.style.cursor,
    };
    el.setAttribute("contenteditable", "plaintext-only");
    el.spellcheck = false;
    Object.assign(el.style, { outline: "2px solid #2563eb", outlineOffset: "2px", cursor: "text" });
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    const stop = (event: Event) => event.stopPropagation();
    const onKey = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    };
    const onBlur = () => finish(true);
    const finish = (save: boolean) => {
      if (editing !== el) return;
      editing = null;
      el.removeEventListener("keydown", onKey);
      for (const type of ["keyup", "keypress", "input", "beforeinput"])
        el.removeEventListener(type, stop);
      el.removeEventListener("blur", onBlur);
      el.removeAttribute("contenteditable");
      Object.assign(el.style, {
        outline: before.outline,
        outlineOffset: before.offset,
        cursor: before.cursor,
      });
      window.getSelection()?.removeAllRanges();
      const text = (el.innerText ?? "").replace(/\s+/g, " ").trim();
      if (save && text && text !== original.trim()) onTextEdit(el.dataset.fid!, text);
      // Put the app's own text back; the saved version reloads the screen with the new text.
      else if (el.textContent !== original) el.textContent = original;
    };
    el.addEventListener("keydown", onKey);
    for (const type of ["keyup", "keypress", "input", "beforeinput"])
      el.addEventListener(type, stop);
    el.addEventListener("blur", onBlur);
  };

  // Outside select mode, a double-click on text edits it: in place when its text is written
  // in the source (and editing is allowed here), else it opens in the inspector.
  const onDoubleClick = (event: Event) => {
    if (enabled || editing) return;
    let el = target(event);
    const first = el;
    while (el && literalTextFor(el.dataset.fid!) === null)
      el = el.parentElement?.closest("[data-fid]") as HTMLElement | null;
    window.getSelection()?.removeAllRanges();
    if (el && textEditing) {
      event.preventDefault();
      editInPlace(el, el.textContent ?? "");
      return;
    }
    const chosen = el ?? first;
    if (chosen) select(chosen);
  };

  for (const type of [
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "touchstart",
    "touchend",
  ]) {
    window.addEventListener(type, swallow, { capture: true });
  }
  window.addEventListener("click", onClick, { capture: true });
  window.addEventListener("dblclick", onDoubleClick, { capture: true });
  window.addEventListener("pointermove", onMove, { capture: true });
  window.addEventListener(
    "scroll",
    () => {
      if (selectedEl) place(selected, selectedEl);
    },
    { capture: true },
  );

  return {
    get enabled() {
      return enabled;
    },
    setTextEditing(next: boolean) {
      textEditing = next;
    },
    setEnabled(next: boolean) {
      enabled = next;
      document.body.style.cursor = next ? "crosshair" : "";
      if (!next) {
        place(hover, null);
        place(selected, null);
        selectedEl = null;
      }
    },
  };
}

function makeOverlay(border: string, background: string): HTMLDivElement {
  const el = document.createElement("div");
  Object.assign(el.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483647",
    border,
    background,
    borderRadius: "4px",
    display: "none",
  });
  document.body.appendChild(el);
  return el;
}

function place(overlay: HTMLDivElement, el: Element | null) {
  if (!el) {
    overlay.style.display = "none";
    return;
  }
  const r = el.getBoundingClientRect();
  Object.assign(overlay.style, {
    display: "block",
    left: `${r.left - 2}px`,
    top: `${r.top - 2}px`,
    width: `${r.width + 4}px`,
    height: `${r.height + 4}px`,
  });
}
