"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

import type { ScoreNow, Spot } from "@/lib/api";
import { scoreColor, scoreLabel } from "@/lib/score";

/**
 * Frame the map on the spots themselves. The detail card floats over the bottom right on wide
 * screens, so the bounds are padded on that side to keep the coastline clear of it.
 */
function FlyToSelected({ spots, selected }: { spots: Spot[]; selected: string | null }) {
  const map = useMap();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const wasNull = previous.current === null;
    previous.current = selected;
    // The first non-null selection is the automatic default (the best spot), so keep the fitted
    // overview of the whole coast. Only a deliberate change of spot moves the map.
    if (wasNull || selected === null) return;
    const spot = spots.find((s) => s.slug === selected);
    if (!spot) return;
    map.flyTo([spot.latitude, spot.longitude], Math.max(map.getZoom(), 11), { duration: 0.7 });
  }, [map, spots, selected]);
  return null;
}

function MapChrome({ spots }: { spots: Spot[] }) {
  const map = useMap();

  // Leaflet puts the attribution bottom right by default, where the detail card sits.
  useEffect(() => {
    map.attributionControl?.setPosition("bottomleft");
  }, [map]);

  useEffect(() => {
    if (spots.length === 0) return;
    const bounds = L.latLngBounds(spots.map((s) => [s.latitude, s.longitude] as [number, number]));
    const wide = map.getSize().x > 900;
    map.fitBounds(bounds, {
      paddingTopLeft: [40, 48],
      paddingBottomRight: wide ? [420, 48] : [40, 220],
    });
  }, [map, spots]);
  return null;
}

/**
 * Pins are ranked, not uniform. Built as divIcons (pure HTML, no image assets). The job is finding where it is good, so poor spots recede to a
 * The job is finding where it is good, so only the leading handful carry a numbered badge and the
 * rest recede to a dot. Ranking by position rather than by score keeps the map legible whatever the
 * conditions are: on a flat week everything would otherwise qualify and pile up.
 */
function pinIcon(
  score: number | null,
  featured: boolean,
  selected: boolean,
  hovered: boolean
): L.DivIcon {
  const color = scoreColor(score);

  if (!featured && !selected) {
    const d = hovered ? 16 : 12;
    return L.divIcon({
      className: hovered ? "pin-hovered" : "",
      html: `<div class="pin-shape" style="width:${d}px;height:${d}px;border-radius:999px;
          background:${color};opacity:${hovered ? 0.95 : 0.55};
          border:1.5px solid var(--color-marker-edge);
          box-shadow:0 1px 4px rgb(16 24 40 / .3);"></div>`,
      iconSize: [d, d],
      iconAnchor: [d / 2, d / 2],
    });
  }

  // A teardrop pin: round on three corners, pointed at the bottom left once rotated, so the tip
  // marks the actual spot. The score sits upright inside it.
  const size = selected ? 34 : 30;
  const ring = selected
    ? "box-shadow:0 0 0 2px var(--color-marker-edge), 0 0 0 4px var(--color-accent), 0 6px 16px rgb(16 24 40 / .38);"
    : "box-shadow:0 0 0 2px var(--color-marker-edge), 0 4px 12px rgb(16 24 40 / .32);";
  // A radar ring pings off the selected pin, echoing the mark in the logo.
  const ping = selected ? '<span class="pin-ping"></span>' : "";
  return L.divIcon({
    className: hovered ? "pin-hovered" : "",
    html: `<div style="position:relative;width:${size}px;height:${size}px;">${ping}
        <div class="pin-shape" style="width:${size}px;height:${size}px;background:${color};
        transform:rotate(45deg);border-radius:9999px 9999px 9999px 3px;display:flex;
        align-items:center;justify-content:center;${ring}">
        <span style="transform:rotate(-45deg);color:var(--color-badge-ink);font-weight:800;
        font-size:${selected ? 13 : 12}px;letter-spacing:-.02em;font-variant-numeric:tabular-nums;">
        ${scoreLabel(score)}</span></div></div>`,
    iconSize: [size, size],
    // The tip is the bottom-left corner after rotation, so anchor there rather than the centre.
    iconAnchor: [size / 2, size],
  });
}

export default function SpotMap({
  spots,
  scores,
  featured,
  selected,
  hovered,
  onSelect,
  onHover,
}: {
  spots: Spot[];
  scores: Record<string, ScoreNow>;
  featured: Set<string>;
  selected: string | null;
  hovered: string | null;
  onSelect: (slug: string) => void;
  onHover: (slug: string | null) => void;
}) {
  return (
    <MapContainer center={[38.85, -9.4]} zoom={10} zoomControl={false} className="h-full w-full">
      {/* Voyager rather than the flat grey light basemap: it renders water with a real tint, so the
          Atlantic does not read as dead space. CARTO tiles, OSM data. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
      />
      <MapChrome spots={spots} />
      <FlyToSelected spots={spots} selected={selected} />
      {spots.map((spot) => (
        <Marker
          key={spot.slug}
          position={[spot.latitude, spot.longitude]}
          icon={pinIcon(
            scores[spot.slug]?.score ?? null,
            featured.has(spot.slug),
            spot.slug === selected,
            spot.slug === hovered
          )}
          zIndexOffset={spot.slug === selected ? 1000 : 0}
          eventHandlers={{
            click: () => onSelect(spot.slug),
            mouseover: () => onHover(spot.slug),
            mouseout: () => onHover(null),
          }}
          alt={spot.name}
        />
      ))}
    </MapContainer>
  );
}
