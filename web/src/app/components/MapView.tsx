"use client";

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import { generateDCPoints, haversine, PointFeature, convertCrashDataToGeoJSON } from '../lib/mapUtils';
import { useCrashData } from '../hooks/useCrashData';
import { CrashData } from '../api/crashes/route';

export type PopupData = { 
	lngLat: [number, number]; 
	mag?: number; 
	text?: string; 
	crashData?: CrashData;
	stats?: { count: number; avg?: number; min?: number; max?: number; radiusMeters?: number } 
} | null;

interface MapViewProps {
	mapStyleChoice: 'dark' | 'streets';
	heatRadius: number;
	heatIntensity: number;
	heatVisible: boolean;
	pointsVisible: boolean;
	onMapReady?: (map: mapboxgl.Map) => void;
	onPopupCreate?: (p: PopupData) => void; // fires when user clicks features and we want to show popup
	onGeocoderResult?: (lngLat: [number, number]) => void;
	useRealCrashData?: boolean; // whether to use real crash data or synthetic data
	crashData?: CrashData[]; // external crash data to use
}

export default function MapView({ 
	mapStyleChoice, 
	heatRadius, 
	heatIntensity, 
	heatVisible, 
	pointsVisible, 
	onMapReady, 
	onPopupCreate, 
	onGeocoderResult, 
	useRealCrashData = true,
	crashData = []
}: MapViewProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<mapboxgl.Map | null>(null);
	const styleChoiceRef = useRef<'dark' | 'streets'>(mapStyleChoice);
	const [size, setSize] = useState({ width: 0, height: 0 });
	const dcDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
	const crashDataHook = useCrashData({ autoLoad: false, limit: 10000 }); // Don't auto-load if external data provided

	// Update map data when crash data is loaded
	useEffect(() => {
		const activeData = crashData.length > 0 ? crashData : crashDataHook.data;
		console.log('MapView useEffect: crashData.length =', crashData.length, 'crashDataHook.data.length =', crashDataHook.data.length);
		if (useRealCrashData && activeData.length > 0) {
			console.log('Converting crash data to GeoJSON...');
			dcDataRef.current = convertCrashDataToGeoJSON(activeData);
			// Update the map source if map is ready
			const map = mapRef.current;
			if (map && map.isStyleLoaded()) {
				console.log('Updating map source with new data...');
				if (map.getSource('dc-quakes')) {
					(map.getSource('dc-quakes') as mapboxgl.GeoJSONSource).setData(dcDataRef.current);
				} else {
					console.log('Source not found, calling addDataAndLayers');
					// Call the inner function manually - we need to recreate it here
					if (dcDataRef.current) {
						console.log('Adding data and layers, data has', dcDataRef.current.features.length, 'features');
						if (!map.getSource('dc-quakes')) {
							console.log('Creating new source');
							map.addSource('dc-quakes', { type: 'geojson', data: dcDataRef.current });
						}
						// Add layers if they don't exist
						if (!map.getLayer('dc-heat')) {
							map.addLayer({
								id: 'dc-heat', type: 'heatmap', source: 'dc-quakes', maxzoom: 15,
								paint: {
									'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 6, 1],
									'heatmap-intensity': heatIntensity,
									'heatmap-color': [
										'interpolate', 
										['linear'], 
										['heatmap-density'], 
										0, 'rgba(0,0,0,0)', 
										0.2, 'rgba(255,255,0,0.7)', 
										0.4, 'rgba(255,165,0,0.8)', 
										0.6, 'rgba(255,69,0,0.9)', 
										0.8, 'rgba(255,0,0,0.95)', 
										1, 'rgba(139,0,0,1)'
									],
									'heatmap-radius': heatRadius,
									'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 12, 0.8]
								}
							});
						}
						if (!map.getLayer('dc-point')) {
							map.addLayer({
								id: 'dc-point', type: 'circle', source: 'dc-quakes', minzoom: 12,
								paint: {
									'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 3, 6, 10],
									'circle-color': [
										'interpolate', 
										['linear'], 
										['get', 'mag'], 
										1, styleChoiceRef.current === 'dark' ? '#ffff99' : '#ffa500',
										3, styleChoiceRef.current === 'dark' ? '#ff6666' : '#ff4500',
										6, styleChoiceRef.current === 'dark' ? '#ff0000' : '#8b0000'
									] as any,
									'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.7, 14, 0.9],
									'circle-stroke-width': 1,
									'circle-stroke-color': styleChoiceRef.current === 'dark' ? '#ffffff' : '#000000'
								}
							});
						}
						// Update layer visibility
						if (map.getLayer('dc-heat')) {
							map.setLayoutProperty('dc-heat', 'visibility', heatVisible ? 'visible' : 'none');
						}
						if (map.getLayer('dc-point')) {
							map.setLayoutProperty('dc-point', 'visibility', pointsVisible ? 'visible' : 'none');
						}
					}
				}
			} else {
				console.log('Map style not loaded yet');
			}
		}
	}, [useRealCrashData, crashDataHook.data, crashData, heatRadius, heatIntensity, heatVisible, pointsVisible]);

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
			const colorExpression = [
				'interpolate', 
				['linear'], 
				['get', 'mag'], 
				1, mapStyleChoice === 'dark' ? '#ffff99' : '#ffa500',
				3, mapStyleChoice === 'dark' ? '#ff6666' : '#ff4500',
				6, mapStyleChoice === 'dark' ? '#ff0000' : '#8b0000'
			] as any;
			const strokeColor = mapStyleChoice === 'dark' ? '#ffffff' : '#000000';
			try { 
				map.setPaintProperty('dc-point', 'circle-color', colorExpression);
				map.setPaintProperty('dc-point', 'circle-stroke-color', strokeColor);
			} catch (e) {}
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

		// NOTE: geocoder control intentionally removed from map-level UI.
		// The sidebar provides embedded geocoder inputs; keeping both leads to duplicate controls.

		// Initialize data based on preference
		const activeData = crashData.length > 0 ? crashData : crashDataHook.data;
		console.log('Initializing map data, activeData length:', activeData.length);
		if (useRealCrashData && activeData.length > 0) {
			console.log('Using real crash data');
			dcDataRef.current = convertCrashDataToGeoJSON(activeData);
		} else if (!useRealCrashData) {
			console.log('Using synthetic data');
			dcDataRef.current = generateDCPoints(900);
		} else {
			console.log('No data available yet, using empty data');
			dcDataRef.current = { type: 'FeatureCollection' as const, features: [] };
		}

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
			if (!map || !dcDataRef.current) {
				console.log('addDataAndLayers: map or data not ready', !!map, !!dcDataRef.current);
				return;
			}

			console.log('Adding data and layers, data has', dcDataRef.current.features.length, 'features');

			if (!map.getSource('dc-quakes')) {
				console.log('Creating new source');
				map.addSource('dc-quakes', { type: 'geojson', data: dcDataRef.current });
			} else {
				console.log('Updating existing source');
				(map.getSource('dc-quakes') as mapboxgl.GeoJSONSource).setData(dcDataRef.current);
			}

			if (!map.getLayer('dc-heat')) {
				map.addLayer({
					id: 'dc-heat', type: 'heatmap', source: 'dc-quakes', maxzoom: 15,
					paint: {
						'heatmap-weight': ['interpolate', ['linear'], ['get', 'mag'], 0, 0, 6, 1],
						'heatmap-intensity': heatIntensity,
						'heatmap-color': [
							'interpolate', 
							['linear'], 
							['heatmap-density'], 
							0, 'rgba(0,0,0,0)', 
							0.2, 'rgba(255,255,0,0.7)', 
							0.4, 'rgba(255,165,0,0.8)', 
							0.6, 'rgba(255,69,0,0.9)', 
							0.8, 'rgba(255,0,0,0.95)', 
							1, 'rgba(139,0,0,1)'
						],
						'heatmap-radius': heatRadius,
						'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 12, 0.8]
					}
				});
			}

			if (!map.getLayer('dc-point')) {
				map.addLayer({
					id: 'dc-point', type: 'circle', source: 'dc-quakes', minzoom: 12,
					paint: {
						'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 3, 6, 10],
						'circle-color': [
							'interpolate', 
							['linear'], 
							['get', 'mag'], 
							1, styleChoiceRef.current === 'dark' ? '#ffff99' : '#ffa500',
							3, styleChoiceRef.current === 'dark' ? '#ff6666' : '#ff4500',
							6, styleChoiceRef.current === 'dark' ? '#ff0000' : '#8b0000'
						],
						'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0.7, 14, 0.9],
						'circle-stroke-width': 1,
						'circle-stroke-color': styleChoiceRef.current === 'dark' ? '#ffffff' : '#000000'
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
			console.log('Map loaded, adding initial data and layers');
			addDataAndLayers();
			// ensure map is fit to DC bounds initially
			try { map.fitBounds(dcBounds, { padding: 20 }); } catch (e) { /* ignore if fitBounds fails */ }

			map.on('click', 'dc-point', (e) => {
				const feature = e.features && e.features[0];
				if (!feature) return;
				const coords = (feature.geometry as any).coordinates.slice() as [number, number];
				const mag = feature.properties ? feature.properties.mag : undefined;
				const crashData = feature.properties ? feature.properties.crashData : undefined;
				const stats = computeNearbyStats(coords, 500);
				
				let text = `Severity: ${mag ?? 'N/A'}`;
				if (crashData) {
					text = `Crash Report
Date: ${new Date(crashData.reportDate).toLocaleDateString()}
Address: ${crashData.address}
Vehicles: ${crashData.totalVehicles} | Pedestrians: ${crashData.totalPedestrians} | Bicycles: ${crashData.totalBicycles}
Fatalities: ${crashData.fatalDriver + crashData.fatalPedestrian + crashData.fatalBicyclist}
Major Injuries: ${crashData.majorInjuriesDriver + crashData.majorInjuriesPedestrian + crashData.majorInjuriesBicyclist}`;
				}
				
				if (onPopupCreate) onPopupCreate({ lngLat: coords, mag, crashData, text, stats });
			});

			map.on('click', 'dc-heat', (e) => {
				const p = e.point;
				const bbox = [[p.x - 6, p.y - 6], [p.x + 6, p.y + 6]] as [mapboxgl.PointLike, mapboxgl.PointLike];
				const nearby = map.queryRenderedFeatures(bbox, { layers: ['dc-point'] });
				if (nearby && nearby.length > 0) {
					const f = nearby[0];
					const coords = (f.geometry as any).coordinates.slice() as [number, number];
					const mag = f.properties ? f.properties.mag : undefined;
					const crashData = f.properties ? f.properties.crashData : undefined;
					const stats = computeNearbyStats(coords, 500);
					
					let text = `Severity: ${mag ?? 'N/A'}`;
					if (crashData) {
						text = `Crash Report
Date: ${new Date(crashData.reportDate).toLocaleDateString()}
Address: ${crashData.address}
Vehicles: ${crashData.totalVehicles} | Pedestrians: ${crashData.totalPedestrians} | Bicycles: ${crashData.totalBicycles}
Fatalities: ${crashData.fatalDriver + crashData.fatalPedestrian + crashData.fatalBicyclist}
Major Injuries: ${crashData.majorInjuriesDriver + crashData.majorInjuriesPedestrian + crashData.majorInjuriesBicyclist}`;
					}
					
					if (onPopupCreate) onPopupCreate({ lngLat: coords, mag, crashData, text, stats });
				} else {
					const stats = computeNearbyStats([e.lngLat.lng, e.lngLat.lat], 500);
					if (onPopupCreate) onPopupCreate({ lngLat: [e.lngLat.lng, e.lngLat.lat], text: 'Zoom in to see individual crash reports and details', stats });
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
		// container should fill its parent so parent can control sizing (flex)
		<div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
			<div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
		</div>
	);
}
