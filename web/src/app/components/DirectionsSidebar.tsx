"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import GeocodeInput from './GeocodeInput';

interface Props {
  mapRef: React.MutableRefObject<mapboxgl.Map | null>;
  profile?: "mapbox/driving" | "mapbox/walking" | "mapbox/cycling";
}

// Routing now uses geocoder-only selection inside the sidebar (no manual coordinate parsing)

export default function DirectionsSidebar({ mapRef, profile = "mapbox/driving" }: Props) {
  // Sidebar supports collapse via a hamburger button in the header
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [originText, setOriginText] = useState<string>("");
  const [destText, setDestText] = useState<string>("");
  const [originCoord, setOriginCoord] = useState<[number, number] | null>(null);
  const [destCoord, setDestCoord] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  // custom geocoder inputs + suggestions (we implement our own UI instead of the library)
  const originQueryRef = useRef<string>("");
  const destQueryRef = useRef<string>("");
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [originSuggestions, setOriginSuggestions] = useState<any[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<any[]>([]);
  const originTimer = useRef<number | null>(null);
  const destTimer = useRef<number | null>(null);
  const originInputRef = useRef<HTMLDivElement | null>(null);
  const destInputRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // We'll implement our own geocoder fetcher and suggestion UI.
  const fetchSuggestions = async (q: string) => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || mapboxgl.accessToken || (typeof window !== 'undefined' ? (window as any).NEXT_PUBLIC_MAPBOX_TOKEN : undefined);
    if (!token) {
      console.warn('[DirectionsSidebar] Mapbox token missing; suggestions disabled');
      return [];
    }
    if (!q || q.trim().length === 0) return [];
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?autocomplete=true&limit=6&types=place,locality,address,region,poi&access_token=${token}`;
    try {
      console.debug('[DirectionsSidebar] fetchSuggestions url=', url);
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      const feats = data.features || [];
      console.debug('[DirectionsSidebar] fetchSuggestions results=', feats.length);
      return feats;
    } catch (e) {
      console.warn('[DirectionsSidebar] fetchSuggestions error', e);
      return [];
    }
  };

  // debounce origin query
  useEffect(() => {
    if (originTimer.current) window.clearTimeout(originTimer.current);
    if (!originQuery) {
      setOriginSuggestions([]);
      return;
    }
    originTimer.current = window.setTimeout(async () => {
      const features = await fetchSuggestions(originQuery);
      if (mountedRef.current) setOriginSuggestions(features);
    }, 250) as unknown as number;
    return () => { if (originTimer.current) window.clearTimeout(originTimer.current); };
  }, [originQuery]);

  // debounce dest query
  useEffect(() => {
    if (destTimer.current) window.clearTimeout(destTimer.current);
    if (!destQuery) {
      setDestSuggestions([]);
      return;
    }
    destTimer.current = window.setTimeout(async () => {
      const features = await fetchSuggestions(destQuery);
      if (mountedRef.current) setDestSuggestions(features);
    }, 250) as unknown as number;
    return () => { if (destTimer.current) window.clearTimeout(destTimer.current); };
  }, [destQuery]);

  // when collapsed toggles, mount or unmount geocoder controls to keep DOM stable
  useEffect(() => {
    // if expanded, ensure the geocoder instances are attached to their containers
      if (!collapsed) {
        // nothing to mount for the custom inputs — they are regular DOM inputs rendered below
      } else {
        // nothing to clear: we are managing suggestions via state
      }
  }, [collapsed]);

  // note: we no longer listen for map-level geocoder results here because
  // the sidebar now embeds its own two geocoder controls and captures results directly.

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
    const o = originCoord;
    const d = destCoord;
    if (!o || !d) {
      alert('Please select both origin and destination using the location search boxes.');
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
  // clear suggestions and inputs
  setOriginSuggestions([]);
  setDestSuggestions([]);
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
  className={`relative flex flex-col z-40 ${collapsed ? 'w-11 h-11 self-start m-3 rounded-full overflow-hidden bg-transparent' : 'w-[340px] h-full bg-[#111214] rounded-tr-lg rounded-br-lg'}`}
    >
      {/* Toggle */}
      <button
        aria-label={collapsed ? 'Expand directions' : 'Collapse directions'}
        onClick={() => setCollapsed((s) => !s)}
        title={collapsed ? 'Expand directions' : 'Minimize directions'}
        className={collapsed
          ? 'w-full h-full rounded-full bg-white text-black/85 flex items-center justify-center shadow-md border border-black/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/60'
          : 'absolute top-3 right-3 -m-1 p-1 w-9 h-9 rounded-md bg-white/5 text-white border border-black/10 flex items-center justify-center hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/60 z-50 pointer-events-auto'
        }
      >
        {/* increase hit area with an inner svg and ensure cursor is pointer */}
        <svg aria-hidden="true" className="w-5 h-5 pointer-events-none" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 6h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 12h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 18h18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Content — render only when expanded to avoid any collapsed 'strip' */}
      <div className={`flex flex-col flex-1 p-4 overflow-auto ${collapsed ? 'hidden' : ''}`}>
          <div className="flex items-center justify-between mb-3 sticky top-2 z-10">
            <strong className="text-sm">Directions</strong>
          </div>

          <div className="flex flex-col gap-3 directions-sidebar-geocoder">
            <div className="flex items-start gap-2 min-w-0">
              <label className="text-sm w-20 flex-shrink-0 pt-2">Origin</label>
              <div className="flex-1 min-w-0">
                <div className="p-1">
                  <GeocodeInput
                    mapRef={mapRef}
                    placeholder="Search origin"
                    value={originQuery}
                    onChange={(v) => { setOriginQuery(v); setOriginText(''); }}
                    onSelect={(f) => { const c = f.center; if (c && c.length === 2) { setOriginCoord([c[0], c[1]]); setOriginText(f.place_name || ''); setOriginQuery(f.place_name || ''); try { const m = mapRef.current; if (m) m.easeTo({ center: c, zoom: 14 }); } catch(e){} } }}
                  />
                </div>
                <div className="mt-2 text-xs text-gray-400 truncate">{originText}</div>
              </div>
            </div>

            <div className="flex items-start gap-2 min-w-0">
              <label className="text-sm w-20 flex-shrink-0 pt-2">Destination</label>
              <div className="flex-1 min-w-0">
                <div className="p-1">
                  <GeocodeInput
                    mapRef={mapRef}
                    placeholder="Search destination"
                    value={destQuery}
                    onChange={(v) => { setDestQuery(v); setDestText(''); }}
                    onSelect={(f) => { const c = f.center; if (c && c.length === 2) { setDestCoord([c[0], c[1]]); setDestText(f.place_name || ''); setDestQuery(f.place_name || ''); try { const m = mapRef.current; if (m) m.easeTo({ center: c, zoom: 14 }); } catch(e){} } }}
                  />
                </div>
                <div className="mt-2 text-xs text-gray-400 truncate">{destText}</div>
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <button onClick={handleGetRoute} disabled={loading} className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-[#ff7e5f] to-[#ffb199] text-white shadow-md">{loading ? 'Routing…' : 'Get Route'}</button>
              <button onClick={handleClear} className="px-4 py-2 rounded-lg border border-black/10 bg-transparent text-sm">Clear</button>
            </div>

            {/* pick-on-map mode removed; sidebar uses geocoder-only inputs */}
          </div>
        </div>
    </div>
  );
}
