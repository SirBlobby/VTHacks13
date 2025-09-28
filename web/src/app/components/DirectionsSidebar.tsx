"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import GeocodeInput from './GeocodeInput';
import { useCrashData } from '../hooks/useCrashData';
import { calculateRouteCrashDensity, createRouteGradientStops } from '../../lib/mapUtils';
import { fetchSafeRoute, type SafeRouteData } from '../../lib/flaskApi';

interface Props {
  mapRef: React.MutableRefObject<mapboxgl.Map | null>;
  profile?: "mapbox/driving" | "mapbox/walking" | "mapbox/cycling";
  onMapPickingModeChange?: (isActive: boolean) => void; // callback when map picking mode changes
  gradientRoutes?: boolean; // whether to use gradient routes or solid routes
  mapStyleChoice?: 'dark' | 'streets'; // map style for panel theming
}

// Routing now uses geocoder-only selection inside the sidebar (no manual coordinate parsing)

// Routing now uses geocoder-only selection inside the sidebar (no manual coordinate parsing)

export default function DirectionsSidebar({ mapRef, profile = "mapbox/driving", onMapPickingModeChange, gradientRoutes = true, mapStyleChoice = 'dark' }: Props) {
  // Sidebar supports collapse via a hamburger button in the header
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [originText, setOriginText] = useState<string>("");
  const [destText, setDestText] = useState<string>("");
  const [originCoord, setOriginCoord] = useState<[number, number] | null>(null);
  const [destCoord, setDestCoord] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [alternateRoute, setAlternateRoute] = useState<any>(null);
  const [rerouteInfo, setRerouteInfo] = useState<any>(null);
  const crashDataHook = useCrashData({ autoLoad: true, limit: 10000 });
  const [isOriginMapPicking, setIsOriginMapPicking] = useState(false);
  const [isDestMapPicking, setIsDestMapPicking] = useState(false);
  const [routes, setRoutes] = useState<any[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  // Safe route functionality
  const [safeRouteData, setSafeRouteData] = useState<SafeRouteData | null>(null);
  const [safeRouteLoading, setSafeRouteLoading] = useState(false);
  const [showSafeRoute, setShowSafeRoute] = useState(false);
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

  // Helper function to normalize safety score to 0-10 scale
  const normalizeSafetyScore = (rawScore: number): number => {
    console.log('Raw safety score:', rawScore); // Debug log
    
    // Based on the safety score calculation:
    // - 0 = no crashes (perfectly safe) 
    // - 1-5 = low danger
    // - 5-20 = moderate danger  
    // - 20+ = high danger
    
    if (rawScore === 0) return 10; // Perfect safety
    
    // Use logarithmic scale to handle wide range of scores
    // Map common ranges: 0.1->9.5, 1->8, 5->6, 20->3, 50->1, 100+->0
    const safetyScore = Math.max(0, 10 - Math.log10(rawScore + 1) * 2.5);
    
    console.log('Normalized safety score:', safetyScore); // Debug log
    return Math.max(0, Math.min(10, safetyScore));
  };

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Notify parent when map picking mode changes
  useEffect(() => {
    if (onMapPickingModeChange) {
      onMapPickingModeChange(isOriginMapPicking || isDestMapPicking);
    }
  }, [isOriginMapPicking, isDestMapPicking, onMapPickingModeChange]);

  // Handle gradient routes setting changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || routes.length === 0) return;

    // Re-render existing routes with updated gradient setting
    renderMultipleRoutes(map, routes, selectedRouteIndex);
  }, [gradientRoutes]);

  // Handle map clicks for point selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: mapboxgl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      
      if (isOriginMapPicking) {
        // Prevent other map click handlers from running
        if (e.originalEvent) {
          e.originalEvent.stopPropagation();
          e.originalEvent.stopImmediatePropagation();
        }
        setOriginCoord([lng, lat]);
        setOriginText(`Selected: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        setOriginQuery(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        setIsOriginMapPicking(false);
        // Center map on selected point
        map.easeTo({ center: [lng, lat], zoom: 14 });
        return;
      } else if (isDestMapPicking) {
        // Prevent other map click handlers from running
        if (e.originalEvent) {
          e.originalEvent.stopPropagation();
          e.originalEvent.stopImmediatePropagation();
        }
        setDestCoord([lng, lat]);
        setDestText(`Selected: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        setDestQuery(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        setIsDestMapPicking(false);
        // Center map on selected point
        map.easeTo({ center: [lng, lat], zoom: 14 });
        return;
      }
    };

    if (isOriginMapPicking || isDestMapPicking) {
      map.on('click', handleMapClick);
      // Change cursor to crosshair when in picking mode
      map.getCanvas().style.cursor = 'crosshair';
    } else {
      map.getCanvas().style.cursor = '';
    }

    return () => {
      map.off('click', handleMapClick);
      map.getCanvas().style.cursor = '';
    };
  }, [isOriginMapPicking, isDestMapPicking, mapRef]);

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
      if (map.getLayer("directions-line-outline")) map.removeLayer("directions-line-outline");
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
    // Remove alternate route layers/sources
    try {
      if (map.getLayer("alternate-route-line")) map.removeLayer("alternate-route-line");
    } catch (e) {}
    try {
      if (map.getSource("alternate-route")) map.removeSource("alternate-route");
    } catch (e) {}
    // Remove multiple route layers/sources and their outlines
    for (let i = 1; i < 3; i++) { // Back to 2 routes (indices 1-2)
      try {
        if (map.getLayer(`route-line-${i}`)) map.removeLayer(`route-line-${i}`);
      } catch (e) {}
      try {
        if (map.getLayer(`route-line-${i}-outline`)) map.removeLayer(`route-line-${i}-outline`);
      } catch (e) {}
      try {
        if (map.getSource(`route-${i}`)) map.removeSource(`route-${i}`);
      } catch (e) {}
    }
  }

  async function fetchRoute(o: [number, number], d: [number, number]) {
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!accessToken) {
      console.warn("Mapbox token missing (NEXT_PUBLIC_MAPBOX_TOKEN)");
      return null;
    }
    const coords = `${o[0]},${o[1]};${d[0]},${d[1]}`;
    const url = `https://api.mapbox.com/directions/v5/${profile}/${coords}?geometries=geojson&overview=full&steps=false&alternatives=true&access_token=${accessToken}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Directions API error: ${res.status}`);
    const data = await res.json();
    return data;
  }

  // Function to render multiple routes with different styles
  function renderMultipleRoutes(map: mapboxgl.Map, routes: any[], selectedIndex: number) {
    const routeColors = ['#2563eb', '#9333ea']; // blue, purple
    const routeWidths = [6, 4]; // selected route is thicker
    const routeOpacities = [0.95, 0.7]; // selected route is more opaque

    routes.forEach((route, index) => {
      const sourceId = index === 0 ? 'directions-route' : `route-${index}`;
      const layerId = index === 0 ? 'directions-line' : `route-line-${index}`;
      
      const isSelected = index === selectedIndex;
      const geo: GeoJSON.Feature<GeoJSON.Geometry> = { 
        type: "Feature", 
        properties: { routeIndex: index }, 
        geometry: route.geometry 
      };

      // Add or update source
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, { type: "geojson", data: geo, lineMetrics: true });
      } else {
        (map.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(geo);
      }

      // Add layer if it doesn't exist
      if (!map.getLayer(layerId)) {
        map.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { 
            "line-color": routeColors[index] || routeColors[0],
            "line-width": 4, 
            "line-opacity": 0.7
          },
        });

        // Add click handler for route selection
        map.on('click', layerId, () => {
          setSelectedRouteIndex(index);
          renderMultipleRoutes(map, routes, index);
        });

        // Change cursor on hover
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      // Apply crash density gradient to all routes if crash data is available and gradient routes enabled
      if (gradientRoutes && crashDataHook.data.length > 0) {
        const routeCoordinates = (route.geometry as any).coordinates as [number, number][];
        const crashDensities = calculateRouteCrashDensity(routeCoordinates, crashDataHook.data, 150);
        const gradientStops = createRouteGradientStops(crashDensities);
        
        map.setPaintProperty(layerId, 'line-gradient', gradientStops as [string, ...any[]]);
        map.setPaintProperty(layerId, 'line-color', undefined); // Remove solid color when using gradient
        map.setPaintProperty(layerId, 'line-width', isSelected ? routeWidths[0] : routeWidths[1]);
        map.setPaintProperty(layerId, 'line-opacity', isSelected ? routeOpacities[0] : routeOpacities[1]);
      } else {
        // Apply solid color styling when gradient routes disabled or no crash data
        map.setPaintProperty(layerId, 'line-gradient', undefined); // Remove gradient
        map.setPaintProperty(layerId, 'line-color', routeColors[index] || routeColors[0]);
        map.setPaintProperty(layerId, 'line-width', isSelected ? routeWidths[0] : routeWidths[1]);
        map.setPaintProperty(layerId, 'line-opacity', isSelected ? routeOpacities[0] : routeOpacities[1]);
      }

      // Add blue outline for selected route
      const outlineLayerId = `${layerId}-outline`;
      if (isSelected) {
        // Add outline layer if it doesn't exist
        if (!map.getLayer(outlineLayerId)) {
          map.addLayer({
            id: outlineLayerId,
            type: "line",
            source: sourceId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": "#60a5fa", // Light blue outline
              "line-width": routeWidths[0] + 4, // Thicker than the main line
              "line-opacity": 0.8
            },
          }, layerId); // Add below the main route line
        } else {
          // Update existing outline
          map.setPaintProperty(outlineLayerId, 'line-width', routeWidths[0] + 4);
          map.setPaintProperty(outlineLayerId, 'line-opacity', 0.8);
        }
      } else {
        // Remove outline for non-selected routes
        if (map.getLayer(outlineLayerId)) {
          map.removeLayer(outlineLayerId);
        }
      }
    });
  }

  // Function to call the predict endpoint
  async function callPredictEndpoint(source: [number, number], destination: [number, number]) {
    try {
      const response = await fetch('http://127.0.0.1:5000/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: { lat: source[1], lon: source[0] },
          destination: { lat: destination[1], lon: destination[0] }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Predict endpoint error: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.warn('Predict endpoint call failed:', error);
      return null;
    }
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
      // Call predict endpoint first to check if rerouting is needed
      const predictResult = await callPredictEndpoint(o, d);
      console.log('Predict endpoint result:', predictResult);
      
      const data = await fetchRoute(o, d);
      if (!data || !data.routes || data.routes.length === 0) {
        alert("No route found");
        return;
      }
      
      // Store all available routes
      const allRoutes = data.routes;
      setRoutes(allRoutes);
      setSelectedRouteIndex(0);

      removeRouteFromMap(map);

      // Check if rerouting is needed based on predict endpoint (using the first route)
      let shouldShowAlternate = false;
      if (predictResult && predictResult.reroute_needed && predictResult.path) {
        shouldShowAlternate = true;
        setRerouteInfo(predictResult);
        
        // Create alternate route using the predicted path
        const alternatePath = predictResult.path.map((coord: [number, number]) => [coord[1], coord[0]]);
        const alternateGeo: GeoJSON.Feature<GeoJSON.Geometry> = {
          type: "Feature",
          properties: { type: "alternate" },
          geometry: { type: "LineString", coordinates: alternatePath }
        };
        
        // Add alternate route source and layer
        if (!map.getSource("alternate-route")) {
          map.addSource("alternate-route", { type: "geojson", data: alternateGeo });
        } else {
          (map.getSource("alternate-route") as mapboxgl.GeoJSONSource).setData(alternateGeo);
        }
        if (!map.getLayer("alternate-route-line")) {
          map.addLayer({
            id: "alternate-route-line",
            type: "line",
            source: "alternate-route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { "line-color": "#22c55e", "line-width": 5, "line-opacity": 0.8, "line-dasharray": [2, 2] },
          });
        }
      } else {
        setRerouteInfo(null);
        // Remove alternate route if it exists
        try {
          if (map.getLayer("alternate-route-line")) map.removeLayer("alternate-route-line");
          if (map.getSource("alternate-route")) map.removeSource("alternate-route");
        } catch (e) {}
      }

      // Render all routes with different styles
      renderMultipleRoutes(map, allRoutes, 0);

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

      // zoom to route bounds (using the selected route)
      try {
        const selectedRoute = allRoutes[selectedRouteIndex];
        const coords = (selectedRoute.geometry as any).coordinates as [number, number][];
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
    // Clear GeocodeInput queries
    setOriginQuery("");
    setDestQuery("");
    // clear suggestions and inputs
    setOriginSuggestions([]);
    setDestSuggestions([]);
    // Clear alternate route state
    setAlternateRoute(null);
    setRerouteInfo(null);
    // Clear map picking states
    setIsOriginMapPicking(false);
    setIsDestMapPicking(false);
    // Clear multiple routes state
    setRoutes([]);
    setSelectedRouteIndex(0);
    // Clear safe route state
    setSafeRouteData(null);
    setShowSafeRoute(false);
    // Remove safe route from map if it exists
    if (map) {
      try {
        if (map.getLayer("safe-route-line")) map.removeLayer("safe-route-line");
        if (map.getSource("safe-route")) map.removeSource("safe-route");
      } catch (e) {}
    }
  }

  // Safe route functionality
  async function handleGetSafeRoute() {
    const map = mapRef.current;
    if (!map) return;
    const o = originCoord;
    const d = destCoord;
    if (!o || !d) {
      alert('Please select both origin and destination using the location search boxes.');
      return;
    }

    setSafeRouteLoading(true);
    try {
      const safeRouteResult = await fetchSafeRoute(o[1], o[0], d[1], d[0]); // API expects lat, lon
      console.log('Safe route result:', safeRouteResult);
      setSafeRouteData(safeRouteResult);
      setShowSafeRoute(true);

      // If we have a recommended route, display it
      if (safeRouteResult.recommended_route?.geometry?.coordinates) {
        const safeRouteGeo: GeoJSON.Feature<GeoJSON.Geometry> = {
          type: "Feature",
          properties: { type: "safe-route" },
          geometry: {
            type: "LineString",
            coordinates: safeRouteResult.recommended_route.geometry.coordinates
          }
        };

        // Add safe route to map
        if (!map.getSource("safe-route")) {
          map.addSource("safe-route", { type: "geojson", data: safeRouteGeo });
        } else {
          (map.getSource("safe-route") as mapboxgl.GeoJSONSource).setData(safeRouteGeo);
        }

        if (!map.getLayer("safe-route-line")) {
          map.addLayer({
            id: "safe-route-line",
            type: "line",
            source: "safe-route",
            layout: { "line-join": "round", "line-cap": "round" },
            paint: { 
              "line-color": "#10b981", // green color for safe route
              "line-width": 6, 
              "line-opacity": 0.8,
              "line-dasharray": [1, 1] // subtle dashed line to differentiate
            },
          });
        }
      }
    } catch (error) {
      console.error('Error fetching safe route:', error);
      alert('Failed to fetch safe route. Please try again.');
    } finally {
      setSafeRouteLoading(false);
    }
  }

  // re-add layers after style change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    function onStyleData() {
      if (!map) return;
      // Re-render all routes if they exist
      if (routes.length > 0) {
        renderMultipleRoutes(map, routes, selectedRouteIndex);
      }
      // Re-add points layer
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
      // Re-add alternate route layer if it exists
      if (map.getSource("alternate-route") && !map.getLayer("alternate-route-line")) {
        map.addLayer({
          id: "alternate-route-line",
          type: "line",
          source: "alternate-route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#22c55e", "line-width": 5, "line-opacity": 0.8, "line-dasharray": [2, 2] },
        });
      }
    }
    map.on("styledata", onStyleData);
    return () => { map.off("styledata", onStyleData); };
  }, [mapRef, routes, selectedRouteIndex]);

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

  // Dynamic styling based on map style
  const getSidebarClasses = () => {
    const baseClasses = "relative flex flex-col z-40";
    
    if (collapsed) {
      return `${baseClasses} w-11 h-11 self-start m-3 rounded-full overflow-hidden bg-transparent`;
    }
    
    // Use dark backgrounds for both themes for better contrast
    return `${baseClasses} w-[340px] h-full rounded-tr-lg rounded-br-lg border-r` + 
           ` bg-[var(--panel-darker)] border-[var(--panel-medium)]`;
  };

  const getToggleButtonClasses = () => {
    if (collapsed) {
      // Dark button for collapsed state on both themes
      return 'w-full h-full rounded-full text-[#f9fafb] flex items-center justify-center shadow-md border focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#9ca3af]' +
             ' bg-[var(--panel-dark)] border-[var(--panel-medium)]';
    } else {
      // Dark button for expanded state on both themes
      return 'absolute top-3 right-3 -m-1 p-1 w-9 h-9 rounded-md text-[#f9fafb] border flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#9ca3af] z-50 pointer-events-auto' +
             ' bg-[var(--panel-dark)] border-[var(--panel-medium)] hover:bg-[var(--panel-medium)]';
    }
  };

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Directions sidebar"
      className={getSidebarClasses()}
    >
      {/* Toggle */}
      <button
        aria-label={collapsed ? 'Expand directions' : 'Collapse directions'}
        onClick={() => setCollapsed((s) => !s)}
        title={collapsed ? 'Expand directions' : 'Minimize directions'}
        className={getToggleButtonClasses()}
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
            <strong className="text-sm text-[#f5f5f5]">Directions</strong>
          </div>

          <div className="flex flex-col gap-3 directions-sidebar-geocoder">
            <div className="flex items-start gap-2 min-w-0">
              <label className="text-sm w-20 flex-shrink-0 pt-2 text-[#d1d5db]">Origin</label>
              <div className="flex-1 min-w-0">
                <div className="p-1">
                  <GeocodeInput
                    mapRef={mapRef}
                    placeholder="Search origin or use Submit to pick on map"
                    value={originQuery}
                    onChange={(v) => { setOriginQuery(v); setOriginText(''); }}
                    onSelect={(f) => { 
                      const c = f.center; 
                      if (c && c.length === 2) { 
                        setOriginCoord([c[0], c[1]]); 
                        setOriginText(f.place_name || ''); 
                        setOriginQuery(f.place_name || ''); 
                        try { 
                          const m = mapRef.current; 
                          if (m) m.easeTo({ center: c, zoom: 14 }); 
                        } catch(e){} 
                      } 
                    }}
                    onMapPick={() => {
                      setIsOriginMapPicking(!isOriginMapPicking);
                      setIsDestMapPicking(false); // Cancel dest picking if active
                    }}
                    isMapPickingMode={isOriginMapPicking}
                  />
                </div>
                <div className="mt-2 text-xs text-[#a1a1aa] truncate">{originText}</div>
              </div>
            </div>

            <div className="flex items-start gap-2 min-w-0">
              <label className="text-sm w-20 flex-shrink-0 pt-2 text-[#d1d5db]">Destination</label>
              <div className="flex-1 min-w-0">
                <div className="p-1">
                  <GeocodeInput
                    mapRef={mapRef}
                    placeholder="Search destination or use Submit to pick on map"
                    value={destQuery}
                    onChange={(v) => { setDestQuery(v); setDestText(''); }}
                    onSelect={(f) => { 
                      const c = f.center; 
                      if (c && c.length === 2) { 
                        setDestCoord([c[0], c[1]]); 
                        setDestText(f.place_name || ''); 
                        setDestQuery(f.place_name || ''); 
                        try { 
                          const m = mapRef.current; 
                          if (m) m.easeTo({ center: c, zoom: 14 }); 
                        } catch(e){} 
                      } 
                    }}
                    onMapPick={() => {
                      setIsDestMapPicking(!isDestMapPicking);
                      setIsOriginMapPicking(false); // Cancel origin picking if active
                    }}
                    isMapPickingMode={isDestMapPicking}
                  />
                </div>
                <div className="mt-2 text-xs text-[#a1a1aa] truncate">{destText}</div>
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              <button onClick={handleGetRoute} disabled={loading} className="flex-1 px-3 py-2 rounded-lg text-white shadow-md disabled:opacity-60 transition-colors text-sm" style={{ backgroundColor: 'var(--panel-dark)' }}>{loading ? 'Routing…' : 'Get Route'}</button>
              <button onClick={handleGetSafeRoute} disabled={safeRouteLoading} className="flex-1 px-3 py-2 rounded-lg text-white shadow-md disabled:opacity-60 transition-colors text-sm" style={{ backgroundColor: '#10b981' }}>{safeRouteLoading ? 'AI Routing…' : 'Safe Route'}</button>
              <button onClick={handleClear} className="px-3 py-2 rounded-lg border text-sm text-[#d1d5db] transition-colors" style={{ backgroundColor: 'var(--panel-medium)', borderColor: 'var(--panel-light)' }} onMouseEnter={(e) => (e.target as HTMLButtonElement).style.backgroundColor = 'var(--panel-light)'} onMouseLeave={(e) => (e.target as HTMLButtonElement).style.backgroundColor = 'var(--panel-medium)'}>Clear</button>
            </div>

            {/* Route Options */}
            {routes.length > 1 && (
              <div className="mt-4 p-3 rounded-lg border" style={{ backgroundColor: 'var(--panel-medium)', borderColor: 'var(--panel-light)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-4 h-4 text-[#d1d5db]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-1.447-.894L15 4m0 13V4m-6 3l6-3" />
                  </svg>
                  <span className="text-sm font-medium text-[#f5f5f5]">Route Options ({routes.length})</span>
                </div>
                <div className="space-y-2">
                  {routes.map((route, index) => {
                    const isSelected = index === selectedRouteIndex;
                    const colors = ['#2563eb', '#9333ea']; // blue, purple
                    const labels = ['Route 1 (Fastest)', 'Route 2 (Alternative)'];
                    const duration = Math.round(route.duration / 60);
                    const distance = Math.round(route.distance / 1000 * 10) / 10;
                    
                    return (
                      <button
                        key={index}
                        onClick={() => {
                          setSelectedRouteIndex(index);
                          if (mapRef.current) {
                            renderMultipleRoutes(mapRef.current, routes, index);
                          }
                        }}
                        className={`w-full text-left p-2 rounded-md border transition-colors ${
                          isSelected 
                            ? 'border-[#2563eb]' 
                            : 'border-[var(--panel-light)]'
                        }`}
                        style={{
                          backgroundColor: isSelected ? 'var(--panel-light)' : 'var(--panel-medium)',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) (e.target as HTMLButtonElement).style.backgroundColor = 'var(--panel-light)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) (e.target as HTMLButtonElement).style.backgroundColor = 'var(--panel-medium)';
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: colors[index] || colors[0] }}
                            ></div>
                            <span className="text-sm font-medium text-[#f5f5f5]">
                              {labels[index] || `Route ${index + 1}`}
                            </span>
                          </div>
                          {isSelected && (
                            <svg className="w-4 h-4 text-[#2563eb]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-[#9ca3af]">
                          {duration} min • {distance} km
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-[#a1a1aa] mt-2">
                  Click on a route to select it or click directly on the map
                </p>
              </div>
            )}

            {/* Show reroute information if available */}
            {rerouteInfo && (
              <div className="mt-4 p-3 rounded-lg border border-[#10b981]" style={{ backgroundColor: 'var(--panel-dark)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-[#10b981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-[#ecfdf5]">
                    {rerouteInfo.reroute_needed ? 'Safer Route Available' : 'Current Route is Optimal'}
                  </span>
                </div>
                {rerouteInfo.reroute_needed && rerouteInfo.risk_improvement && (
                  <p className="text-xs text-[#a7f3d0]">
                    Risk reduction: {rerouteInfo.risk_improvement.toFixed(2)} points
                  </p>
                )}
                {rerouteInfo.reason && (
                  <p className="text-xs text-[#a7f3d0]">
                    {rerouteInfo.reason === 'no_lower_risk_found' ? 'No safer alternatives found' : rerouteInfo.reason}
                  </p>
                )}
                {rerouteInfo.reroute_needed && (
                  <div className="mt-2 text-xs text-[#a7f3d0]">
                    <span className="inline-block w-3 h-0.5 bg-[#22c55e] mr-2"></span>
                    Green dashed line shows safer route
                  </div>
                )}
              </div>
            )}

            {/* Safe Route Analysis */}
            {showSafeRoute && safeRouteData && (
              <div className="mt-4 p-3 rounded-lg border border-[#10b981]" style={{ backgroundColor: 'var(--panel-dark)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-[#10b981]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-sm font-medium text-[#ecfdf5]">AI Safe Route Analysis</span>
                </div>
                
                <div className="space-y-2">
                  <div className="text-xs text-[#a7f3d0]">
                    <div className="flex justify-between">
                      <span>Safety Score:</span>
                      <span className={`font-medium ${
                        normalizeSafetyScore(safeRouteData.recommended_route.safety_score) >= 7 
                          ? 'text-green-400' 
                          : normalizeSafetyScore(safeRouteData.recommended_route.safety_score) >= 4 
                            ? 'text-yellow-400' 
                            : 'text-red-400'
                      }`}>
                        {normalizeSafetyScore(safeRouteData.recommended_route.safety_score).toFixed(1)}/10
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Distance:</span>
                      <span className="font-medium">{safeRouteData.recommended_route.distance_km.toFixed(1)} km</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Duration:</span>
                      <span className="font-medium">{Math.round(safeRouteData.recommended_route.duration_min)} min</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Crashes Nearby:</span>
                      <span className="font-medium">{safeRouteData.recommended_route.crashes_nearby}</span>
                    </div>
                  </div>
                  
                  {safeRouteData.safety_analysis && (
                    <div className="text-xs text-[#a7f3d0] border-t border-[#065f46] pt-2">
                      <div className="font-medium mb-1">Safety Analysis:</div>
                      <div className="text-[#6ee7b7]">{safeRouteData.safety_analysis}</div>
                    </div>
                  )}
                  
                  {safeRouteData.weather_summary && (
                    <div className="text-xs text-[#a7f3d0] border-t border-[#065f46] pt-2">
                      <div className="font-medium mb-1">Weather Conditions:</div>
                      <div className="text-[#6ee7b7]">{safeRouteData.weather_summary}</div>
                    </div>
                  )}

                  <div className="mt-2 text-xs text-[#a7f3d0] flex items-center">
                    <span className="inline-block w-3 h-0.5 bg-[#10b981] mr-2"></span>
                    Green line shows AI-recommended safe route
                  </div>
                </div>
              </div>
            )}

            {/* Route Safety Legend */}
            {(originCoord && destCoord) && (
              <div className="mt-4 p-3 rounded-lg border" style={{ backgroundColor: 'var(--panel-medium)', borderColor: 'var(--panel-light)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-[#d1d5db]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-medium text-[#f5f5f5]">Route Safety Legend</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-1 bg-[#22c55e] rounded"></div>
                    <span className="text-[#d1d5db]">Low crash risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-1 bg-[#eab308] rounded"></div>
                    <span className="text-[#d1d5db]">Moderate risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-1 bg-[#f97316] rounded"></div>
                    <span className="text-[#d1d5db]">High risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-1 bg-[#9333ea] rounded"></div>
                    <span className="text-[#d1d5db]">Very high risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-1 bg-[#7f1d1d] rounded"></div>
                    <span className="text-[#d1d5db]">Extreme risk</span>
                  </div>
                </div>
                <p className="text-xs text-[#a1a1aa] mt-2">
                  Colors based on historical crash data within 150m of route
                </p>
              </div>
            )}

            {/* Map picking mode indicator */}
            {(isOriginMapPicking || isDestMapPicking) && (
              <div className="mt-4 p-3 rounded-lg border" style={{ backgroundColor: 'var(--panel-dark)', borderColor: '#3b82f6' }}>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#93c5fd]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-[#dbeafe]">
                      Map Picking Mode Active
                    </p>
                    <p className="text-xs text-[#93c5fd]">
                      {isOriginMapPicking ? "Click anywhere on the map to set your origin location" : "Click anywhere on the map to set your destination location"}
                    </p>
                    <button 
                      onClick={() => {
                        setIsOriginMapPicking(false);
                        setIsDestMapPicking(false);
                      }}
                      className="mt-2 text-xs text-[#93c5fd] hover:text-[#dbeafe] underline"
                    >
                      Cancel map picking
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* pick-on-map mode removed; sidebar uses geocoder-only inputs */}
          </div>
        </div>
    </div>
  );
}
