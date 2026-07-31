/**
 * A breaking wave, used wherever the app is waiting.
 *
 * The curl is a thick stroked spiral rather than a filled shape: the stroke rises up the face,
 * pitches over the top and hooks back down, which leaves the hollow as negative space. A filled
 * path closes over that hollow and reads as a dome instead. Pure CSS animation over a static SVG,
 * no JS timer, no library, and it holds still under prefers-reduced-motion.
 */
export default function WaveLoader({
  label = "Loading",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-2.5 ${className}`} role="status">
      <svg className="wave" viewBox="0 0 124 54" width="124" height="54" aria-hidden focusable="false">
        {/* the waterline the wave is breaking on, running out past the shoulder */}
        <path
          className="wave-shoulder"
          d="M8 47 C 34 44, 62 50, 116 45"
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
        />

        {/* the curl: up the face, over the lip, hooking back into the hollow */}
        <g className="wave-curl">
          <path
            d="M12 42 C 13 22, 27 10, 46 11 C 63 12, 72 23, 67 33 C 64 25, 55 22, 50 29"
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </g>

        {/* whitewater where the lip lands */}
        <g className="wave-white">
          <circle cx="44" cy="42" r="5.5" />
          <circle cx="33" cy="44" r="4" />
          <circle cx="54" cy="44" r="3.4" />
          <circle cx="24" cy="45" r="2.4" />
        </g>

        {/* spray thrown off the lip */}
        <circle className="wave-foam wave-foam-1" cx="72" cy="12" r="1.8" />
        <circle className="wave-foam wave-foam-2" cx="80" cy="17" r="1.3" />
        <circle className="wave-foam wave-foam-3" cx="66" cy="6" r="1.1" />
      </svg>
      <span className="faint">{label}</span>
    </div>
  );
}
