"use client";

import L from "leaflet";
import { MapContainer, Marker, TileLayer } from "react-leaflet";

import { scoreColor, scoreLabel } from "@/lib/score";

import "leaflet/dist/leaflet.css";

/**
 * One spot on the map, for the spot page.
 *
 * Deliberately the same basemap and the same teardrop pin as the main map, so arriving here from a
 * shared link does not feel like a different product. It is also the page's only image: without it the
 * report was a column of text, which is what made it read as a document rather than part of an app.
 *
 * Not interactive. Dragging and zooming belong on the real map, and a second half-working map competing
 * for the same gestures is worse than a still one with a link to the full thing.
 */
export default function SpotMiniMap({
  latitude,
  longitude,
  score,
  name,
}: {
  latitude: number;
  longitude: number;
  score: number | null;
  name: string;
}) {
  const colour = scoreColor(score);
  // Same construction as the ranked pins on the main map: pure HTML in a divIcon, no image assets.
  const icon = L.divIcon({
    className: "",
    iconSize: [40, 46],
    iconAnchor: [20, 44],
    html: `
      <div style="position:relative;width:40px;height:46px;">
        <div style="position:absolute;left:2px;top:0;width:36px;height:36px;border-radius:50% 50% 50% 0;
                    transform:rotate(-45deg);background:${colour};
                    border:2px solid var(--color-marker-edge);
                    box-shadow:0 6px 14px -4px rgb(16 24 40 / 0.45);"></div>
        <div style="position:absolute;left:2px;top:0;width:36px;height:36px;display:flex;
                    align-items:center;justify-content:center;font-weight:800;font-size:13px;
                    color:var(--color-badge-ink);">${scoreLabel(score)}</div>
      </div>`,
  });

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={13}
      zoomControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      keyboard={false}
      attributionControl={false}
      className="h-full w-full"
      style={{ background: "var(--color-water)" }}
    >
      <TileLayer url="https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png" />
      <Marker position={[latitude, longitude]} icon={icon} alt={name} interactive={false} />
    </MapContainer>
  );
}
