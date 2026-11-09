import type { SelectedElement } from "@appbuilder/contract";

/**
 * Click-to-select inside the preview. While enabled, pointer input is captured before the
 * app sees it (so buttons don't fire), the element under the pointer with a `data-fid` is
 * outlined, and a click reports it to the parent.
 */
export function createSelection(
  onSelect: (element: SelectedElement) => void,
  literalTextFor: (fid: string) => string | null = () => null,
) {
  let enabled = false;
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

  const onClick = (event: Event) => {
    if (!enabled) return;
    swallow(event);
    const el = target(event);
    if (!el) return;
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
  window.addEventListener("pointermove", onMove, { capture: true });
  window.addEventListener(
    "scroll",
    () => {
      if (selectedEl) place(selected, selectedEl);
    },
    { capture: true },
  );

  return {
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
