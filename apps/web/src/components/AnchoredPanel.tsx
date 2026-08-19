"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A panel positioned against the control that opened it, rendered into `document.body`.
 *
 * The portal is not decoration, it is the whole trick. `.panel-raised` sets a `backdrop-filter`, and
 * any ancestor with one becomes the containing block for `position: fixed` descendants. Rendered in
 * place, this panel's viewport coordinates were therefore applied relative to the sheet, which threw
 * it to the right-hand side of a wide screen. It only looked correct on a phone, where the sheet is
 * full width and the two coordinate systems happen to coincide.
 *
 * Positioning history, for anyone tempted to simplify this back:
 *
 * - **Inline** grew the trigger's wrapper, and since these sit in a flex row, `align-items: stretch`
 *   stretched the control beside it.
 * - **Absolute** stopped that, but an absolutely positioned box still counts towards its scroll
 *   container's scrollable overflow, so opening a menu made the content-sized sheet taller and
 *   shifted everything above it.
 * - **Fixed, in place** hit the containing-block problem above.
 * - **Fixed, in a portal** is the one that works.
 *
 * Dismissal lives here too, so every panel behaves the same and two cannot be open at once: a
 * pointer-down anywhere except this panel or its own trigger closes it.
 */

type Position = { left: number; width: number; top: number | null; bottom: number | null };

const GAP = 6;
const EDGE = 8;

function compute(el: HTMLElement, minWidth: number, expectedHeight: number): Position {
  const r = el.getBoundingClientRect();
  const width = Math.max(r.width, minWidth);
  // Clamped, so a trigger near an edge does not push its panel off screen.
  const left = Math.min(Math.max(EDGE, r.left), Math.max(EDGE, window.innerWidth - width - EDGE));
  const roomBelow = window.innerHeight - r.bottom;
  // Open upward only when below is tight AND above is genuinely roomier.
  const flip = roomBelow < expectedHeight && r.top > roomBelow;
  return flip
    ? { left, width, top: null, bottom: window.innerHeight - r.top + GAP }
    : { left, width, top: r.bottom + GAP, bottom: null };
}

export default function AnchoredPanel({
  anchorEl,
  triggerEl,
  onDismiss,
  minWidth = 0,
  expectedHeight = 280,
  children,
}: {
  /** Element the panel is positioned against. */
  anchorEl: HTMLElement;
  /** Element whose own click toggles the panel, so pointing at it must not also dismiss. Defaults
   *  to anchorEl, and differs when a panel is aligned to a row but opened by one control in it. */
  triggerEl?: HTMLElement | null;
  onDismiss: () => void;
  minWidth?: number;
  /** Roughly how tall the content is, used only to decide whether to open upward. */
  expectedHeight?: number;
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState(() => compute(anchorEl, minWidth, expectedHeight));
  const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);

  // A fixed panel cannot follow its anchor, so re-measure rather than dismiss. Dismissing on scroll
  // was an earlier attempt and it backfired: the select sets scrollTop on its list to centre the
  // current option, that fires a scroll event, and the panel closed itself instantly.
  useEffect(() => {
    const update = () => setPos(compute(anchorEl, minWidth, expectedHeight));
    // Capture, because the scrolling happens on an inner container rather than on window.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorEl, minWidth, expectedHeight]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (panelEl?.contains(target)) return;
      if ((triggerEl ?? anchorEl).contains(target)) return;
      onDismiss();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        // Stop the sheet behind from also treating this as a request to close itself.
        event.stopPropagation();
        onDismiss();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [panelEl, triggerEl, anchorEl, onDismiss]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={setPanelEl}
      className="fixed z-[1400]"
      style={{
        left: pos.left,
        width: pos.width,
        ...(pos.top !== null ? { top: pos.top } : {}),
        ...(pos.bottom !== null ? { bottom: pos.bottom } : {}),
      }}
    >
      {children}
    </div>,
    document.body
  );
}
