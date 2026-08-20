"use client";

import dynamic from "next/dynamic";

/**
 * Client wrapper so the spot page can stay a Server Component.
 *
 * `ssr: false` is not allowed with `next/dynamic` inside a Server Component, and Leaflet touches
 * `window` at import time, so it cannot be server-rendered either. One thin client boundary satisfies
 * both: everything around it, including every number and the hours ahead, still renders on the server.
 */
const SpotMiniMap = dynamic(() => import("./SpotMiniMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-water" />,
});

export default function MiniMapCard(props: {
  latitude: number;
  longitude: number;
  score: number | null;
  name: string;
}) {
  return <SpotMiniMap {...props} />;
}
