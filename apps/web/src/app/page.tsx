"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { getScores, getSpots, type ScoreNow, type Spot } from "@/lib/api";

const SpotMap = dynamic(() => import("@/components/SpotMap"), { ssr: false });
const ForecastPanel = dynamic(() => import("@/components/ForecastPanel"), { ssr: false });

export default function Home() {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [scores, setScores] = useState<Record<string, ScoreNow>>({});
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getSpots().then(setSpots).catch(console.error);
    getScores()
      .then((rows) => setScores(Object.fromEntries(rows.map((r) => [r.slug, r]))))
      .catch(console.error);
  }, []);

  const selectedSpot = selected ? spots.find((s) => s.slug === selected) : null;

  return (
    <main className="relative h-screen w-screen">
      <SpotMap
        spots={spots}
        scores={scores}
        onSelect={setSelected}
        hideInfoBar={selected !== null}
      />
      {selectedSpot && (
        <ForecastPanel
          key={selectedSpot.slug}
          slug={selectedSpot.slug}
          name={selectedSpot.name}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
