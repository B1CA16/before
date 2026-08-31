"use client";

import { useEffect, useRef } from "react";

/** Everything the browser will let you Tab to. `[hidden]` and disabled controls are excluded. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Make a dialog behave like one: focus goes in, Tab stays inside, Escape closes, focus comes back.
 *
 * The sheets already declared `role="dialog"` and `aria-modal="true"`, which is a promise to assistive
 * technology that the rest of the page is inert. Nothing enforced it. Tab walked straight out of the
 * sheet and into the map behind it, where a screen reader would then read content the dialog claims is
 * hidden, and a sighted keyboard user would be typing into something they cannot see. Declaring modal
 * behaviour without implementing it is worse than not declaring it.
 *
 * Returning focus to the trigger matters just as much. Without it, closing the sheet drops focus onto
 * `<body>`, and the next Tab starts again from the top of the document, which on this page means
 * tabbing through the whole rail to get back to where you were.
 */
export function useFocusTrap<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  // Captured before focus moves, so it can be handed back on unmount.
  const restoreTo = useRef<HTMLElement | null>(null);
  // Held in a ref so changing the callback identity does not tear down and rebuild the listener.
  // Updated in an effect rather than during render: writing to a ref while rendering is a side effect
  // in the render phase, which React can run twice or discard.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    restoreTo.current = document.activeElement as HTMLElement | null;

    // Focus the first real control rather than the container, so a screen reader announces something
    // useful instead of an empty group.
    const first = container.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? container).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !container) return;

      // Leave focus alone when it is inside something this dialog opened through a portal, such as
      // the calendar grid or a select list. Those render into document.body, so they are outside
      // `container` in DOM terms while being part of the dialog to the user, and wrapping focus back
      // would drag it out of the control they are actually operating.
      if (!container.contains(document.activeElement)) {
        const inPortal = document.activeElement?.closest("[data-portal-panel]");
        if (inPortal) return;
      }

      // Re-queried on every Tab, not cached: the sheet's contents change as you use it (the select
      // panel opens, the saved state replaces the form), and a stale list would trap focus on
      // elements that no longer exist.
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) return;

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const activeEl = document.activeElement;

      // Wrap at both ends. Without this the browser moves focus to the address bar and then to the
      // page behind, which is exactly what aria-modal says cannot happen.
      if (event.shiftKey && (activeEl === firstItem || !container.contains(activeEl))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && activeEl === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Only if the element still exists and can take focus: it may have been removed with the sheet.
      restoreTo.current?.focus?.();
    };
  }, []);

  return ref;
}
