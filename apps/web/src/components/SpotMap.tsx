"use client";

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

import type { ScoreNow, Spot } from "@/lib/api";
import type { ThinnedSpot } from "@/lib/thin";
import { scoreColor, scoreLabel } from "@/lib/score";

/**
 * Frame the map on the spots themselves. The detail card floats over the bottom right on wide
 * screens, so the bounds are padded on that side to keep the coastline clear of it.
 */
function FlyToSelected({
  spots,
  selected,
}: {
  spots: Spot[];
  selected: string | null;
}) {
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
    map.flyTo([spot.latitude, spot.longitude], Math.max(map.getZoom(), 11), {
      duration: 0.7,
    });
  }, [map, spots, selected]);
  return null;
}

function MapChrome({
  spots,
  onZoom,
}: {
  spots: Spot[];
  onZoom: (z: number) => void;
}) {
  const map = useMap();

  // Leaflet puts the attribution bottom right by default, where the detail card sits.
  useEffect(() => {
    map.attributionControl?.setPosition("bottomleft");
  }, [map]);

  // Marker thinning depends on zoom, so the zoom has to become React state. `zoomend` rather than
  // `zoom`, which fires continuously through the animation and would re-thin dozens of times per
  // gesture.
  useEffect(() => {
    const report = () => onZoom(map.getZoom());
    report();
    map.on("zoomend", report);
    return () => {
      map.off("zoomend", report);
    };
  }, [map, onZoom]);

  useEffect(() => {
    if (spots.length === 0) return;
    const bounds = L.latLngBounds(
      spots.map((s) => [s.latitude, s.longitude] as [number, number]),
    );
    const wide = map.getSize().x > 900;
    // Padded east far more than west. The spots sit on a north-south strip of coast, so fitting them
    // with even padding leaves the eastern half of the screen filled with inland Portugal that has no
    // surf in it. Biasing the frame westward puts the Atlantic where the map is actually about.
    map.fitBounds(bounds, {
      paddingTopLeft: [40, 48],
      paddingBottomRight: wide ? [420, 48] : [40, 220],
      maxZoom: 12,
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
  hovered: boolean,
  favourite: boolean,
  hidden = 0,
): L.DivIcon {
  const color = scoreColor(score);

  // A favourite never recedes to a dot. "Featured" means top six by rank today, which is about the
  // conditions; favouriting is about you, and a spot you deliberately marked should stay findable on
  // a flat week when it would otherwise drop out of the leading handful. This is the one place where
  // a personal signal overrides the global ranking.
  if (!featured && !selected && !favourite && hidden === 0) {
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
  // A badge rather than a different pin colour or shape: colour already means score and shape
  // already means rank, so overloading either would make the map ambiguous. It sits outside the
  // rotated element, or it would arrive at 45 degrees with everything else.
  //
  // Deliberately a bare dot with no glyph inside. The badge is 15px across, and nothing legible fits
  // in it: a wave at that size is a smudge, and the heart that used to be here was a leftover from
  // before the icon changed, so the map was saying one thing and the rest of the app another.
  const badge = favourite ? '<span class="pin-mark" aria-hidden></span>' : "";
  // "+3" when this pin stands in for spots that were thinned out at this zoom. Without it the map
  // would quietly drop places, which is worse than a busy map: you cannot tell the difference between
  // "nothing there" and "too crowded to draw".
  const more =
    hidden > 0 ? `<span class="pin-more" aria-hidden>+${hidden}</span>` : "";
  return L.divIcon({
    className: hovered ? "pin-hovered" : "",
    html: `<div style="position:relative;width:${size}px;height:${size}px;">${ping}${badge}${more}
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
  favourites,
  selected,
  hovered,
  onSelect,
  onHover,
  onZoom,
  thinned,
}: {
  spots: Spot[];
  scores: Record<string, ScoreNow>;
  featured: Set<string>;
  favourites: Set<string>;
  selected: string | null;
  hovered: string | null;
  onSelect: (slug: string) => void;
  onHover: (slug: string | null) => void;
  onZoom: (zoom: number) => void;
  /** Which pins to actually draw at this zoom, and how many each stands in for. */
  thinned: ThinnedSpot[];
}) {
  return (
    <MapContainer
      center={[38.85, -9.4]}
      zoom={10}
      zoomControl={false}
      className="h-full w-full"
    >
      {/* OpenStreetMap's own tiles, and the reason is a lesson rather than a preference.
          This used to be CARTO Voyager, which was free and unkeyed when it was chosen. CARTO has
          since started stamping "API KEY REQUIRED" across unkeyed tiles, and the failure was
          invisible to everything we had: the request still returns HTTP 200 with a valid PNG of
          roughly the usual size, so no test, no build and no health check could see it. It was
          found by looking at a screenshot. Anything served from a third party at somebody else's
          discretion can change under you without erroring.

          So the replacement is chosen for its terms, not only its looks: the OSMF tile usage
          policy explicitly permits modest use like this with attribution, which the flat grey
          alternatives from Esri and others do not clearly do. Grey basemaps were also tried and
          rejected on merit: they render the Atlantic in the same grey as the land, and on a surf
          map the coastline is the one line that has to be legible. */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <MapChrome spots={spots} onZoom={onZoom} />
      <FlyToSelected spots={spots} selected={selected} />
      {thinned.map(({ spot, hidden }) => (
        <Marker
          key={spot.slug}
          position={[spot.latitude, spot.longitude]}
          icon={pinIcon(
            scores[spot.slug]?.score ?? null,
            featured.has(spot.slug),
            spot.slug === selected,
            spot.slug === hovered,
            favourites.has(spot.slug),
            hidden,
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
