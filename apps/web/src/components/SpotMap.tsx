"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useState } from "react";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

import type { ScoreNow, Spot } from "@/lib/api";
import { scoreColor, scoreLabel, windLabel } from "@/lib/score";

// Teardrop pin, colored by score, with the score inside. No image assets (divIcon = pure HTML).
function pinIcon(score: number | null): L.DivIcon {
  const color = scoreColor(score);
  return L.divIcon({
    className: "",
    html: `<div style="width:30px;height:30px;border-radius:9999px 9999px 9999px 2px;
        transform:rotate(45deg);background:${color};border:2px solid #fff;
        box-shadow:0 2px 5px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(-45deg);color:#fff;font-weight:700;font-size:12px;">
        ${scoreLabel(score)}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
  });
}

const fmt = (v: number | null | undefined, unit: string) => (v == null ? "-" : `${v}${unit}`);

function InfoBar({ spot, sc }: { spot: Spot; sc: ScoreNow | undefined }) {
  const score = sc?.score ?? null;
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[1000] flex items-center gap-4 rounded-xl bg-slate-900/90 px-4 py-3 text-white shadow-2xl backdrop-blur">
      <div
        className="flex h-12 w-12 flex-none items-center justify-center rounded-lg text-lg font-extrabold"
        style={{ background: scoreColor(score) }}
      >
        {scoreLabel(score)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{spot.name}</div>
        <div className="text-xs text-slate-300">{spot.region}</div>
      </div>
      <div className="hidden gap-4 text-xs text-slate-300 sm:flex">
        <span>
          <b className="text-white">{fmt(sc?.swell_height_m, "m")}</b> swell
        </span>
        <span>
          <b className="text-white">{fmt(sc?.swell_period_s, "s")}</b> period
        </span>
        <span className="text-white">{windLabel(sc?.offshore_component ?? null)}</span>
      </div>
    </div>
  );
}

export default function SpotMap({
  spots,
  scores,
  onSelect,
  hideInfoBar = false,
}: {
  spots: Spot[];
  scores: Record<string, ScoreNow>;
  onSelect: (slug: string) => void;
  hideInfoBar?: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const hoveredSpot = hovered ? spots.find((s) => s.slug === hovered) : null;

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[38.9, -9.4]} zoom={10} className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {spots.map((spot) => (
          <Marker
            key={spot.slug}
            position={[spot.latitude, spot.longitude]}
            icon={pinIcon(scores[spot.slug]?.score ?? null)}
            eventHandlers={{
              click: () => onSelect(spot.slug),
              mouseover: () => setHovered(spot.slug),
              mouseout: () => setHovered(null),
            }}
          />
        ))}
      </MapContainer>
      {hoveredSpot && !hideInfoBar && <InfoBar spot={hoveredSpot} sc={scores[hoveredSpot.slug]} />}
    </div>
  );
}
