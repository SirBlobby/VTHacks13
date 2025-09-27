"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

interface Props {
  mapRef: React.MutableRefObject<mapboxgl.Map | null>;
  profile?: "mapbox/driving" | "mapbox/walking" | "mapbox/cycling";
}

function parseLngLat(value: string): [number, number] | null {
  // Accept formats like: "lng,lat" or "lat,lng" if clearly parseable
  if (!value) return null;
  const parts = value.split(",").map((s) => s.trim());
  if (parts.length !== 2) return null;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (Number.isFinite(a) && Number.isFinite(b)) {
    // Heuristic: if abs(a) > 90 then assume it's lng,lat
    if (Math.abs(a) > 90) return [a, b];
    if (Math.abs(b) > 90) return [b, a];
    // otherwise assume input is lng,lat
    return [a, b];
  }
  return null;
}

export default function DirectionsSidebar({ mapRef, profile = "mapbox/driving" }: Props) {
  // Sidebar supports collapse via a hamburger button in the header
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [originText, setOriginText] = useState<string>("");
  const [destText, setDestText] = useState<string>("");
  const [originCoord, setOriginCoord] = useState<[number, number] | null>(null);
  const [destCoord, setDestCoord] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickMode, setPickMode] = useState<"origin" | "dest" | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function onMapClick(e: mapboxgl.MapMouseEvent) {
      if (!pickMode) return;
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      if (pickMode === "origin") {
        setOriginCoord(lngLat);
        setOriginText(`${lngLat[0].toFixed(5)}, ${lngLat[1].toFixed(5)}`);
      } else {
        setDestCoord(lngLat);
        setDestText(`${lngLat[0].toFixed(5)}, ${lngLat[1].toFixed(5)}`);
      }
      setPickMode(null);
    }

    map.on("click", onMapClick as any);
    return () => { if (map) map.off("click", onMapClick as any); };
  }, [mapRef, pickMode]);

  // helper: remove existing route layers/sources
  function removeRouteFromMap(map: mapboxgl.Map) {
    try {
      if (map.getLayer("directions-line")) map.removeLayer("directions-line");
    } catch (e) {}
    try {
      if (map.getLayer("directions-points")) map.removeLayer("directions-points");
    } catch (e) {}
    try {
      if (map.getSource("directions-route")) map.removeSource("directions-route");
    } catch (e) {}
    try {
      if (map.getSource("directions-points-src")) map.removeSource("directions-points-src");
    } catch (e) {}
  }

  async function fetchRoute(o: [number, number], d: [number, number]) {
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!accessToken) {
      console.warn("Mapbox token missing (NEXT_PUBLIC_MAPBOX_TOKEN)");
      return null;
    }
    const coords = `${o[0]},${o[1]};${d[0]},${d[1]}`;
    const url = `https://api.mapbox.com/directions/v5/${profile}/${coords}?geometries=geojson&overview=full&steps=false&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Directions API error: ${res.status}`);
    const data = await res.json();
    return data;
  }

  async function handleGetRoute() {
    const map = mapRef.current;
    if (!map) return;
    let o = originCoord;
    let d = destCoord;
    // if coords not set but text parsable
    if (!o) o = parseLngLat(originText);
    if (!d) d = parseLngLat(destText);
    if (!o || !d) {
      alert("Please provide origin and destination coordinates or pick them on the map (click 'Pick on map').\nFormat: lng,lat");
      return;
    }

    setLoading(true);
    try {
      const data = await fetchRoute(o, d);
      if (!data || !data.routes || data.routes.length === 0) {
        alert("No route found");
        return;
      }
      const route = data.routes[0];
      const geo: GeoJSON.Feature<GeoJSON.Geometry> = { type: "Feature", properties: {}, geometry: route.geometry };

      removeRouteFromMap(map);

      // add route source and line layer
      if (!map.getSource("directions-route")) {
        map.addSource("directions-route", { type: "geojson", data: geo });
      } else {
        (map.getSource("directions-route") as mapboxgl.GeoJSONSource).setData(geo);
      }
      if (!map.getLayer("directions-line")) {
        map.addLayer({
          id: "directions-line",
          type: "line",
          source: "directions-route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#ff7e5f", "line-width": 6, "line-opacity": 0.95 },
        });
      }

      // add origin/dest points
      const pts: GeoJSON.FeatureCollection<GeoJSON.Point> = {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { role: "origin" }, geometry: { type: "Point", coordinates: o } },
          { type: "Feature", properties: { role: "destination" }, geometry: { type: "Point", coordinates: d } },
        ],
      };
      if (!map.getSource("directions-points-src")) {
        map.addSource("directions-points-src", { type: "geojson", data: pts });
      } else {
        (map.getSource("directions-points-src") as mapboxgl.GeoJSONSource).setData(pts);
      }
      if (!map.getLayer("directions-points")) {
        map.addLayer({
          id: "directions-points",
          type: "circle",
          source: "directions-points-src",
          paint: {
            "circle-radius": 8,
            "circle-color": ["case", ["==", ["get", "role"], "origin"], "#2ecc71", "#e74c3c"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
      }

      // zoom to route bounds
      try {
        const coords = (route.geometry as any).coordinates as [number, number][];
        const b = new mapboxgl.LngLatBounds(coords[0], coords[0]);
        for (let i = 1; i < coords.length; i++) b.extend(coords[i] as any);
        map.fitBounds(b as any, { padding: 60 });
      } catch (e) {}

    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Route request failed");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  function handleClear() {
    const map = mapRef.current;
    if (map) removeRouteFromMap(map);
    setOriginCoord(null);
    setDestCoord(null);
    setOriginText("");
    setDestText("");
  }

  // re-add layers after style change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    function onStyleData() {
      if (!map) return;
      // if a route source exists, we need to re-add the layers
      if (map.getSource("directions-route")) {
        // re-add line layer if missing
        if (!map.getLayer("directions-line")) {
          map.addLayer({
            id: "directions-line",
            type: "line",
            source: "directions-route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#ff7e5f", "line-width": 6, "line-opacity": 0.95 },
          });
        }
      }
      if (map.getSource("directions-points-src") && !map.getLayer("directions-points")) {
        map.addLayer({
          id: "directions-points",
          type: "circle",
          source: "directions-points-src",
          paint: {
            "circle-radius": 8,
            "circle-color": ["case", ["==", ["get", "role"], "origin"], "#2ecc71", "#e74c3c"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });
      }
    }
    map.on("styledata", onStyleData);
    return () => { map.off("styledata", onStyleData); };
  }, [mapRef]);

  // resize map when sidebar collapses/expands so map fills freed space
  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map) return;

    // immediate resize to adapt layout change
    try { map.resize(); } catch (e) { /* ignore */ }

    // also listen for transitionend on the sidebar container and trigger resize
    function onTransition(e: TransitionEvent) {
      if (!map) return;
      // only respond to width/height changes (or all)
      if (e.propertyName === 'width' || e.propertyName === 'height' || e.propertyName === 'all') {
        try { map.resize(); } catch (err) { /* ignore */ }
      }
    }

    // fallback: also schedule a delayed resize in case transitionend doesn't fire
    const t = window.setTimeout(() => { if (map) try { map.resize(); } catch (e) { /* ignore */ } }, 300);

    if (el) el.addEventListener('transitionend', onTransition as any);
    return () => {
      clearTimeout(t);
      if (el) el.removeEventListener('transitionend', onTransition as any);
    };
  }, [collapsed, mapRef]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Directions sidebar"
      className={`flex flex-col transition-all duration-200 ease-in-out z-40 ${collapsed ? 'w-11 h-11 self-start m-3 rounded-full' : 'w-[340px] h-full bg-[#111214] rounded-tr-lg rounded-br-lg'}`}
    >
      {/* Toggle */}
      <button
        aria-label={collapsed ? 'Expand directions' : 'Collapse directions'}
        onClick={() => setCollapsed((s) => !s)}
        title={collapsed ? 'Expand directions' : 'Minimize directions'}
        className={collapsed
          ? 'w-full h-full rounded-full bg-white text-black/85 flex items-center justify-center shadow-md border border-black/10'
          : 'absolute top-3 right-3 w-9 h-9 rounded-md bg-white/5 text-white border border-black/10 flex items-center justify-center hover:bg-white/10'
        }
      >
        <span aria-hidden="true" className="text-lg leading-none">☰</span>
      </button>

      {/* Content (hidden when collapsed) */}
      <div className={`${collapsed ? 'hidden' : 'flex'} flex-col flex-1 p-4 overflow-auto`} aria-hidden={collapsed}>
        <div className="flex items-center justify-between mb-3 sticky top-2 z-10">
          <strong className="text-sm">Directions</strong>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <label className="text-sm w-20 flex-shrink-0">Origin</label>
            <input
              className="flex-1 min-w-0 px-3 py-2 rounded-md border border-black/10 bg-transparent text-sm"
              value={originText}
              onChange={(e) => setOriginText(e.target.value)}
              placeholder="lng,lat"
            />
            <button className="ml-2 px-3 py-1 rounded-md bg-white/5 text-sm flex-shrink-0" onClick={() => setPickMode('origin')}>Pick</button>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <label className="text-sm w-20 flex-shrink-0">Destination</label>
            <input
              className="flex-1 min-w-0 px-3 py-2 rounded-md border border-black/10 bg-transparent text-sm"
              value={destText}
              onChange={(e) => setDestText(e.target.value)}
              placeholder="lng,lat"
            />
            <button className="ml-2 px-3 py-1 rounded-md bg-white/5 text-sm flex-shrink-0" onClick={() => setPickMode('dest')}>Pick</button>
          </div>

          <div className="flex gap-2 mt-2">
            <button onClick={handleGetRoute} disabled={loading} className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-[#ff7e5f] to-[#ffb199] text-white shadow-md">{loading ? 'Routing…' : 'Get Route'}</button>
            <button onClick={handleClear} className="px-4 py-2 rounded-lg border border-black/10 bg-transparent text-sm">Clear</button>
          </div>

          {pickMode && <div className="text-sm">Click on the map to set {pickMode}.</div>}
        </div>
      </div>
    </div>
  );
}
