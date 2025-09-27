"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

interface Props {
  mapRef: React.MutableRefObject<mapboxgl.Map | null>;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  onSelect: (feature: any) => void;
}

export default function GeocodeInput({ mapRef, placeholder = 'Search', value = '', onChange, onSelect }: Props) {
  const [query, setQuery] = useState<string>(value);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const timer = useRef<number | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (value !== query) setQuery(value);
  }, [value]);

  const fetchSuggestions = async (q: string) => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || mapboxgl.accessToken || undefined;
    if (!token) return [];
    if (!q || q.trim().length === 0) return [];
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?autocomplete=true&limit=6&types=place,locality,address,region,poi&access_token=${token}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.features || [];
    } catch (e) {
      return [];
    }
  };

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!query) { setSuggestions([]); return; }
    timer.current = window.setTimeout(async () => {
      const feats = await fetchSuggestions(query);
      if (mounted.current) setSuggestions(feats);
    }, 250) as unknown as number;
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [query]);

  return (
    <div className="relative">
      <input
        type="text"
        className="w-full bg-transparent text-white placeholder-gray-400 rounded-md"
        placeholder={placeholder}
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange && onChange(e.target.value); }}
      />
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 bg-[#0b0b0c] border border-black/20 rounded-md overflow-hidden custom-suggestions">
          {suggestions.map((f: any, i: number) => (
            <button key={f.id || i} className="w-full text-left px-3 py-2 hover:bg-white/5" onClick={() => { onSelect(f); setSuggestions([]); }}>
              <div className="font-medium">{f.text}</div>
              {f.place_name && <div className="text-xs text-gray-400">{f.place_name.replace(f.text, '').replace(/^,\s*/, '')}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
