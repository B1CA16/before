"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { getScores, getSpots, type ScoreNow, type Spot } from "@/lib/api";

const SpotMap = dynamic(() => import("@/components/SpotMap"), { ssr: false });

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

  return (
    <main className="h-screen w-screen">
      <SpotMap spots={spots} scores={scores} onSelect={setSelected} />
      {selected && (
        <div className="absolute right-2 top-2 z-[1000] rounded bg-white p-3 text-sm shadow">
          selected: {selected}
        </div>
      )}
    </main>
  );
}
