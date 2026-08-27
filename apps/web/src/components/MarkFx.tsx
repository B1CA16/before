"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { MarkIcon } from "@/components/Icons";

type MarkFx = {
  /** Say what happened. `from` is the tapped element, which the wave flies out of. */
  announce: (message: string, from?: HTMLElement | null) => void;
};

const Ctx = createContext<MarkFx>({ announce: () => {} });

/** The counter finds itself by id at fire time, so nothing has to be threaded through props. */
export const COUNTER_ID = "mark-counter";

const VISIBLE_MS = 2800;
const FLIGHT_MS = 700;

/**
 * Feedback for marking a spot: the wave you tapped arcs into the counter, which catches it.
 *
 * Why an arc rather than a straight line. A linear tween between two points is what every animation
 * library does by default, and it reads as software. An arc reads as something thrown. It costs one
 * extra keyframe: the midpoint is lifted above the straight path, so horizontal travel stays even
 * while the vertical rises and falls.
 *
 * The flyer is a **clone of the tapped icon**, not a second copy of the path data. That keeps one
 * definition of the mark in `Icons.tsx`, and it means the thing that flies is literally the thing
 * you touched.
 *
 * The landing ping is the radar ring the wordmark's O and the selected map pin already use. Reusing a
 * motif the app owns is what makes this feel like one product rather than a pile of effects.
 *
 * All of this is decoration over an action that already succeeded, so it is fire-and-forget: if the
 * element has gone, or the counter is off screen, or the reader prefers reduced motion, the flight is
 * skipped and the toast still appears.
 */
export function MarkFxProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  // Clear a pending dismissal if this unmounts mid-toast.
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const announce = useCallback((message: string, from?: HTMLElement | null) => {
    seq.current += 1;
    setToast({ message, id: seq.current });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), VISIBLE_MS);

    const target = document.getElementById(COUNTER_ID);
    const source = from?.querySelector("svg");
    if (!from || !target || !source) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const a = from.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);

    const flyer = source.cloneNode(true) as SVGElement;
    flyer.setAttribute("width", "18");
    flyer.setAttribute("height", "18");
    flyer.style.cssText =
      `position:fixed;left:${a.left + a.width / 2 - 9}px;top:${a.top + a.height / 2 - 9}px;` +
      "color:var(--color-mark);z-index:4000;pointer-events:none";
    document.body.appendChild(flyer);

    const flight = flyer.animate(
      [
        { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 },
        {
          // Lifted above the straight line: this single keyframe is what turns a tween into a throw.
          transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 54}px) scale(.9) rotate(-14deg)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: `translate(${dx}px, ${dy}px) scale(.35) rotate(-26deg)`, opacity: 0 },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(.33,0,.5,1)", fill: "forwards" }
    );

    flight.onfinish = () => {
      flyer.remove();
      // Ping only once the wave has landed, so cause and effect line up.
      target.classList.remove("is-caught");
      void target.offsetWidth;
      target.classList.add("is-caught");
      setTimeout(() => target.classList.remove("is-caught"), 700);
    };
  }, []);

  return (
    <Ctx.Provider value={{ announce }}>
      {children}
      {/* No "mounted" flag needed: `toast` is null until a click sets it, and a click can only
          happen in the browser, so this branch is never reached during server rendering. */}
      {toast &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="toast-wrap" role="status" aria-live="polite">
            <div className="toast" key={toast.id}>
              <MarkIcon size={16} weight={2.1} className="text-mark" />
              <span>{toast.message}</span>
            </div>
          </div>,
          document.body
        )}
    </Ctx.Provider>
  );
}

export function useMarkFx(): MarkFx {
  return useContext(Ctx);
}
