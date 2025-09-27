"use client";

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { generateDCPoints, haversine, PointFeature } from '../lib/mapUtils';

export type PopupData = { lngLat: [number, number]; mag?: number; text?: string; stats?: { count: number; avg?: number; min?: number; max?: number; radiusMeters?: number } } | null;

interface MapViewProps {
	mapStyleChoice: 'dark' | 'streets';
	heatRadius: number;
	heatIntensity: number;
	heatVisible: boolean;
	pointsVisible: boolean;
	onMapReady?: (map: mapboxgl.Map) => void;
	onPopupCreate?: (p: PopupData) => void; // fires when user clicks features and we want to show popup
}

export default function MapView({ mapStyleChoice, heatRadius, heatIntensity, heatVisible, pointsVisible, onMapReady, onPopupCreate }: MapViewProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<mapboxgl.Map | null>(null);
	const styleChoiceRef = useRef<'dark' | 'streets'>(mapStyleChoice);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const dcDataRef = useRef<GeoJSON.FeatureCollection | null>(null);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		setSize({ width: el.clientWidth, height: el.clientHeight });

		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const cr = entry.contentRect;
				setSize({ width: Math.round(cr.width), height: Math.round(cr.height) });
			}
		});

		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// react to style choice changes
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		const styleUrl = mapStyleChoice === 'dark' ? 'mapbox://styles/mapbox/dark-v10' : 'mapbox://styles/mapbox/streets-v11';
		try {
			map.setStyle(styleUrl);
		} catch (e) {
			// some map versions may throw; still listen for styledata to re-add layers
		}
		// update the styleChoiceRef so newly-created layers pick up correct color
		styleChoiceRef.current = mapStyleChoice;
		// if the dc-point layer exists, update its circle-color to match the style
		if (map.getLayer && map.getLayer('dc-point')) {
			const color = mapStyleChoice === 'dark' ? '#ffffff' : '#000000';
			try { map.setPaintProperty('dc-point', 'circle-color', color); } catch (e) {}
		}
	}, [mapStyleChoice]);

	useEffect(() => {
		const mapEl = mapContainerRef.current;
		if (!mapEl) return;

		const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
		if (!token) {
			console.warn('Missing NEXT_PUBLIC_MAPBOX_TOKEN environment variable. Mapbox map will not initialize correctly.');
		}
		mapboxgl.accessToken = token ?? '';

		const styleUrl = mapStyleChoice === 'dark'
			? 'mapbox://styles/mapbox/dark-v10'
			: 'mapbox://styles/mapbox/streets-v11';

		// bounding box roughly covering the DMV / Washington, DC area
		const dcBounds: [[number, number], [number, number]] = [
			[-77.25, 38.80], // southwest [lng, lat]
			[-76.90, 39.05]  // northeast [lng, lat]
		];

		mapRef.current = new mapboxgl.Map({ container: mapEl, style: styleUrl, center: [-77.0369, 38.9072], zoom: 11, maxBounds: dcBounds });
		const map = mapRef.current;

		if (!dcDataRef.current) dcDataRef.current = generateDCPoints(900);

		const computeNearbyStats = (center: [number, number], radiusMeters = 500) => {
			const data = dcDataRef.current;
			if (!data) return { count: 0 };
			const mags: number[] = [];
			for (const f of data.features as PointFeature[]) {
				const coord = f.geometry.coordinates as [number, number];
				const d = haversine(center, coord);
				if (d <= radiusMeters) mags.push(f.properties.mag);
			}
			if (mags.length === 0) return { count: 0 };
			const sum = mags.reduce((s, x) => s + x, 0);
			return { count: mags.length, avg: +(sum / mags.length).toFixed(2), min: Math.min(...mags), max: Math.max(...mags), radiusMeters };
		};

		const addDataAndLayers = () => {
			if (!map || !dcDataRef.current) return;

			if (!map.getSource('dc-quakes')) {
				map.addSource('dc-quakes', { type: 'geojson', data: dcDataRef.current });
			} else {
				(map.getSource('dc-quakes') as mapboxgl.GeoJSONSource).setData(dcDataRef.current);
			}

			if (!map.getLayer('dc-heat')) {
				map.addLayer({
					id: 'dc-heat', type: 'heatmap', source: 'dc-quakes', maxzoom: 15,
					paint: {
						'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 6, 1],
						'heatmap-intensity': heatIntensity,
						'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,120,48,0)', 0.2, 'rgba(34,139,34,0.8)', 0.4, 'rgba(154,205,50,0.9)', 0.6, 'rgba(255,215,0,0.95)', 0.8, 'rgba(255,140,0,0.95)', 1, 'rgba(215,25,28,1)'],
						'heatmap-radius': heatRadius,
						'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 12, 0.8]
					}
				});
			}

			if (!map.getLayer('dc-point')) {
				map.addLayer({
					id: 'dc-point', type: 'circle', source: 'dc-quakes', minzoom: 12,
					paint: {
						'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 2, 6, 8],
						'circle-color': styleChoiceRef.current === 'dark' ? '#ffffff' : '#222222',
						'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1]
					}
				});
			}

			if (map.getLayer('dc-heat')) {
				map.setLayoutProperty('dc-heat', 'visibility', heatVisible ? 'visible' : 'none');
				map.setPaintProperty('dc-heat', 'heatmap-radius', heatRadius);
				map.setPaintProperty('dc-heat', 'heatmap-intensity', heatIntensity);
			}
			if (map.getLayer('dc-point')) {
				map.setLayoutProperty('dc-point', 'visibility', pointsVisible ? 'visible' : 'none');
			}
		};

		map.on('load', () => {
			addDataAndLayers();
			// ensure map is fit to DC bounds initially
			try { map.fitBounds(dcBounds, { padding: 20 }); } catch (e) { /* ignore if fitBounds fails */ }

			map.on('click', 'dc-point', (e) => {
				const feature = e.features && e.features[0];
				if (!feature) return;
				const coords = (feature.geometry as any).coordinates.slice() as [number, number];
				const mag = feature.properties ? feature.properties.mag : undefined;
				const stats = computeNearbyStats(coords, 500);
				if (onPopupCreate) onPopupCreate({ lngLat: coords, mag, text: `Magnitude: ${mag ?? 'N/A'}`, stats });
			});

			map.on('click', 'dc-heat', (e) => {
				const p = e.point;
				const bbox = [[p.x - 6, p.y - 6], [p.x + 6, p.y + 6]] as [mapboxgl.PointLike, mapboxgl.PointLike];
				const nearby = map.queryRenderedFeatures(bbox, { layers: ['dc-point'] });
				if (nearby && nearby.length > 0) {
					const f = nearby[0];
					const coords = (f.geometry as any).coordinates.slice() as [number, number];
					const mag = f.properties ? f.properties.mag : undefined;
					const stats = computeNearbyStats(coords, 500);
					if (onPopupCreate) onPopupCreate({ lngLat: coords, mag, text: `Magnitude: ${mag ?? 'N/A'}`, stats });
				} else {
					const stats = computeNearbyStats([e.lngLat.lng, e.lngLat.lat], 500);
					if (onPopupCreate) onPopupCreate({ lngLat: [e.lngLat.lng, e.lngLat.lat], text: 'Zoom in to see individual points and details', stats });
				}
			});

			map.on('mouseenter', 'dc-point', () => map.getCanvas().style.cursor = 'pointer');
			map.on('mouseleave', 'dc-point', () => map.getCanvas().style.cursor = '');
			map.on('mouseenter', 'dc-heat', () => map.getCanvas().style.cursor = 'pointer');
			map.on('mouseleave', 'dc-heat', () => map.getCanvas().style.cursor = '');
		});

		map.on('styledata', () => {
			if (!map.getSource('dc-quakes')) {
				addDataAndLayers();
			}
		});

		if (onMapReady) onMapReady(map);

		return () => {
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, []);

	// update visibility & paint when props change
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;
		if (map.getLayer && map.getLayer('dc-heat')) {
			map.setLayoutProperty('dc-heat', 'visibility', heatVisible ? 'visible' : 'none');
			map.setPaintProperty('dc-heat', 'heatmap-radius', heatRadius);
			map.setPaintProperty('dc-heat', 'heatmap-intensity', heatIntensity);
		}
		if (map.getLayer && map.getLayer('dc-point')) {
			map.setLayoutProperty('dc-point', 'visibility', pointsVisible ? 'visible' : 'none');
		}
	}, [heatRadius, heatIntensity, heatVisible, pointsVisible]);

	return (
		<div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
			<div ref={mapContainerRef} style={{ width: size.width || '100%', height: size.height || '100%' }} />
		</div>
	);
}
