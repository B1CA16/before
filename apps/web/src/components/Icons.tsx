/**
 * The icon set, drawn rather than installed.
 *
 * Consistent with everything else here: inline SVG, `currentColor`, 1.6 stroke weight, round caps, so
 * they inherit text colour and never arrive as a broken image or a font request. An icon library would
 * bring hundreds of glyphs and a second visual language for the eight we actually use.
 *
 * Server-safe: no hooks, no state, so a server component can render them.
 */

type IconProps = { className?: string; size?: number };

function Svg({ size = 15, className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`flex-none ${className}`}
    >
      {children}
    </svg>
  );
}

/** Swell: a breaking line of water, matching the wave in the loader. */
export function SwellIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1 10.5c1.6 0 2.2-1.6 3.6-1.6S6.6 10.5 8 10.5s2-1.6 3.4-1.6S13.4 10.5 15 10.5" />
      <path d="M3 6.2c1.2-2 3-3 5-3s3.8 1 5 3" opacity="0.55" />
    </Svg>
  );
}

/** Period: the gap between waves, so a clock. */
export function PeriodIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.6" />
    </Svg>
  );
}

/** Wind: moving air. */
export function WindIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1.5 6h8a2 2 0 1 0-2-2" />
      <path d="M1.5 10h5.5a1.8 1.8 0 1 1-1.8 1.8" />
      <path d="M11.5 10H14" opacity="0.55" />
    </Svg>
  );
}

/** Tide: the sea level, as a line that rises. */
export function TideIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M1 11h14" />
      <path d="M4 11V7.2M8 11V4.5M12 11V8.6" opacity="0.55" />
      <path d="M5.8 5.6 8 3.4l2.2 2.2" />
    </Svg>
  );
}

/** Where it is. */
export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 14.5s5-4.6 5-8a5 5 0 0 0-10 0c0 3.4 5 8 5 8z" />
      <circle cx="8" cy="6.4" r="1.9" />
    </Svg>
  );
}

/** Language. */
export function GlobeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4" />
      <path d="M8 1.8c1.7 1.8 2.6 4 2.6 6.2S9.7 12.4 8 14.2C6.3 12.4 5.4 10.2 5.4 8S6.3 3.6 8 1.8z" />
    </Svg>
  );
}

/** Forward, for links that leave the page. */
export function ArrowIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 8h10" />
      <path d="M9.2 4.2 13 8l-3.8 3.8" />
    </Svg>
  );
}

/** Rising or falling, used for the tide direction. */
export function TrendIcon({ up = true, ...props }: IconProps & { up?: boolean }) {
  return (
    <Svg {...props}>
      {up ? (
        <>
          <path d="M2.5 11.5 6.5 7l2.6 2.4L13.5 5" />
          <path d="M10.4 5h3.1v3.1" />
        </>
      ) : (
        <>
          <path d="M2.5 5 6.5 9.5l2.6-2.4L13.5 11" />
          <path d="M10.4 11h3.1V7.9" />
        </>
      )}
    </Svg>
  );
}

/** Share: a node passing outward to two others. */
export function ShareIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12.2" cy="3.6" r="1.9" />
      <circle cx="3.8" cy="8" r="1.9" />
      <circle cx="12.2" cy="12.4" r="1.9" />
      <path d="M10.5 4.5 5.5 7.1M5.5 8.9l5 2.6" />
    </Svg>
  );
}
