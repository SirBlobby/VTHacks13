"use client";

import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";

interface Props {
  mapRef: React.MutableRefObject<mapboxgl.Map | null>;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  onSelect: (feature: any) => void;
  onMapPick?: () => void; // New prop for map picking mode
  isMapPickingMode?: boolean; // Whether currently in map picking mode
}

export default function GeocodeInput({ 
  mapRef, 
  placeholder = 'Search location or enter coordinates...', 
  value = '', 
  onChange, 
  onSelect,
  onMapPick,
  isMapPickingMode = false 
}: Props) {
  const [query, setQuery] = useState<string>(value);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const timer = useRef<number | null>(null);
  const mounted = useRef(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => { mounted.current = false; };
  }, []);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (value !== query) setQuery(value);
  }, [value]);

  const fetchSuggestions = async (q: string) => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || mapboxgl.accessToken || undefined;
    if (!token) return [];
    if (!q || q.trim().length === 0) return [];
    
    // Check if the query looks like coordinates (lat,lng or lng,lat)
    const coordinatePattern = /^(-?\d+\.?\d*),?\s*(-?\d+\.?\d*)$/;
    const coordMatch = q.trim().match(coordinatePattern);
    
    if (coordMatch) {
      const [, first, second] = coordMatch;
      const num1 = parseFloat(first);
      const num2 = parseFloat(second);
      
      // Determine which is lat and which is lng based on typical ranges
      // Latitude: -90 to 90, Longitude: -180 to 180
      // For DC area: lat around 38-39, lng around -77
      let lat, lng;
      
      if (Math.abs(num1) <= 90 && Math.abs(num2) <= 180) {
        // Check if first number looks like latitude for DC area
        if (num1 >= 38 && num1 <= 39 && num2 >= -78 && num2 <= -76) {
          lat = num1;
          lng = num2;
        } else if (num2 >= 38 && num2 <= 39 && num1 >= -78 && num1 <= -76) {
          lat = num2;
          lng = num1;
        } else {
          // Default assumption: first is lat, second is lng
          lat = num1;
          lng = num2;
        }
        
        // Validate coordinates are in reasonable ranges
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          // Create a synthetic feature for coordinates
          return [{
            center: [lng, lat],
            place_name: `${lat}, ${lng}`,
            text: `${lat}, ${lng}`,
            properties: {
              isCoordinate: true
            },
            geometry: {
              type: 'Point',
              coordinates: [lng, lat]
            }
          }];
        }
      }
    }
    
    // Washington DC area bounding box: SW corner (-77.25, 38.80), NE corner (-76.90, 39.05)
    const dcBounds = '-77.25,38.80,-76.90,39.05';
    
    // Add proximity to center of DC for better ranking
    const dcCenter = '-77.0369,38.9072'; // Washington DC coordinates
    
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?` +
      `autocomplete=true&limit=6&types=place,locality,address,region,poi&` +
      `bbox=${dcBounds}&proximity=${dcCenter}&` +
      `country=US&access_token=${token}`;
      
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      
      // Additional client-side filtering to ensure results are in DC area
      const dcAreaFeatures = (data.features || []).filter((feature: any) => {
        const coords = feature.center;
        if (!coords || coords.length !== 2) return false;
        
        const [lng, lat] = coords;
        // Check if coordinates are within DC metropolitan area bounds
        return lng >= -77.25 && lng <= -76.90 && lat >= 38.80 && lat <= 39.05;
      });
      
      return dcAreaFeatures;
    } catch (e) {
      return [];
    }
  };

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!query) { 
      setSuggestions([]);
      setShowDropdown(false);
      return; 
    }
    timer.current = window.setTimeout(async () => {
      const feats = await fetchSuggestions(query);
      if (mounted.current) {
        setSuggestions(feats);
        setShowDropdown(feats.length > 0);
      }
    }, 250) as unknown as number;
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [query]);

  return (
    <div className="relative" ref={containerRef}>
      {/* Search bar container matching the design */}
      <div className="flex items-center border rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--panel-medium)', borderColor: 'var(--panel-light)' }}>
        {/* Input field */}
        <input
          type="text"
          className="flex-1 bg-transparent text-[#f5f5f5] placeholder-[#9ca3af] py-3 px-4 focus:outline-none"
          placeholder={isMapPickingMode ? "Click on map to select location..." : placeholder}
          value={query}
          onChange={(e) => { 
            setQuery(e.target.value); 
            onChange && onChange(e.target.value); 
          }}
          onFocus={() => {
            if (!isMapPickingMode && suggestions.length > 0) {
              setShowDropdown(true);
            }
          }}
          disabled={isMapPickingMode}
        />
        
        {/* Pin button */}
        <button
          onClick={() => {
            if (onMapPick) {
              onMapPick();
            }
          }}
          className="px-4 py-3 text-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#9ca3af] focus:ring-offset-2 transition-colors hover:opacity-80"
          style={{ 
            backgroundColor: 'var(--panel-lightest)'
          }}
          title={isMapPickingMode ? "Cancel map picking" : "Pick point on map"}
        >
          {isMapPickingMode ? (
            // X icon for cancel
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            // Pin icon
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </button>
      </div>

      {/* Suggestions dropdown */}
      {!isMapPickingMode && showDropdown && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 mt-1 border rounded-lg shadow-lg overflow-hidden z-50 max-h-64 overflow-y-auto" style={{ backgroundColor: 'var(--panel-medium)', borderColor: 'var(--panel-light)' }}>
          {suggestions.map((f: any, i: number) => (
            <button 
              key={f.id || i} 
              className="w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors" 
              style={{ borderColor: 'var(--panel-light)' }}
              onMouseEnter={(e) => (e.target as HTMLButtonElement).style.backgroundColor = 'var(--panel-light)'}
              onMouseLeave={(e) => (e.target as HTMLButtonElement).style.backgroundColor = 'transparent'} 
              onClick={() => { 
                onSelect(f); 
                setSuggestions([]); 
                setShowDropdown(false);
                setQuery(f.place_name || f.text); 
              }}
            >
              <div className="font-medium text-[#f5f5f5]">{f.text}</div>
              {f.place_name && (
                <div className="text-xs text-[#9ca3af] mt-1">
                  {f.place_name.replace(f.text, '').replace(/^,\s*/, '')} 
                  {!f.place_name.toLowerCase().includes('washington') && !f.place_name.toLowerCase().includes('dc') && 
                    <span className="ml-1 text-[#60a5fa]">• Washington DC Area</span>
                  }
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      
      {/* Map picking mode indicator */}
      {isMapPickingMode && (
        <div className="absolute left-0 right-0 mt-1 bg-[#065f46] border border-[#10b981] rounded-lg p-3 z-50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#10b981] rounded-full animate-pulse"></div>
            <span className="text-sm text-[#ecfdf5]">Click anywhere on the map to select a location</span>
          </div>
        </div>
      )}
    </div>
  );
}
