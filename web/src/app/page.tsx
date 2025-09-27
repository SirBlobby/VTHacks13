"use client";

import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';

import 'mapbox-gl/dist/mapbox-gl.css';

export default function Home() {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const mapContainerRef = useRef<HTMLDivElement | null>(null);
	const mapRef = useRef<mapboxgl.Map | null>(null);
	const [size, setSize] = useState({ width: 0, height: 0 });

	// Generate sample clustered points around Washington, DC
	const generateDCPoints = (count = 500) => {
		const center = { lon: -77.0369, lat: 38.9072 };
		const features: GeoJSON.Feature<GeoJSON.Point, { mag: number }>[] = [];

		// simple clustered distribution using gaussian-like offsets
		const randNormal = () => {
			// Box-Muller transform
			let u = 0, v = 0;
			while (u === 0) u = Math.random();
			while (v === 0) v = Math.random();
			return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
		};

		for (let i = 0; i < count; i++) {
			// cluster radius in degrees (small)
			const radius = Math.abs(randNormal()) * 0.02; // ~ up to ~2km-ish
			const angle = Math.random() * Math.PI * 2;
			const lon = center.lon + Math.cos(angle) * radius;
			const lat = center.lat + Math.sin(angle) * radius;
			// give each point a magnitude/weight to simulate intensity
			const mag = Math.round(Math.max(1, Math.abs(randNormal()) * 6));
			features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: [lon, lat] },
				properties: { mag }
			});
		}

		return {
			type: 'FeatureCollection',
			features
		} as GeoJSON.FeatureCollection<GeoJSON.Geometry>;
	};

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

	useEffect(() => {
		const mapEl = mapContainerRef.current;
		if (!mapEl) return;

		// set your token (keeps the existing token already in the file)
		mapboxgl.accessToken = 'pk.eyJ1IjoicGllbG9yZDc1NyIsImEiOiJjbWcxdTd6c3AwMXU1MmtxMDh6b2l5amVrIn0.5Es0azrah23GX1e9tmbjGw';

		// create the map
		mapRef.current = new mapboxgl.Map({
			container: mapEl,
			style: 'mapbox://styles/mapbox/dark-v10',
			center: [-77.0369, 38.9072], // Washington, DC
			zoom: 11
		});

		const map = mapRef.current;

		map.on('load', () => {
			// add sample DC data
			const dcData = generateDCPoints(900);

			map.addSource('dc-quakes', {
				type: 'geojson',
				data: dcData
			});

			// heatmap layer: white at low density, orange/red at high density
			map.addLayer({
				id: 'dc-heat',
				type: 'heatmap',
				source: 'dc-quakes',
				maxzoom: 15,
				paint: {
					'heatmap-weight': [
						'interpolate',
						['linear'],
						['get', 'mag'],
						0,
						0,
						6,
						1
					],
					'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
					'heatmap-color': [
						'interpolate',
						['linear'],
						['heatmap-density'],
						0,
						'rgba(255,255,255,0)',
						0.1,
						'rgba(255,255,255,0.6)',
						0.3,
						'rgba(255,200,200,0.6)',
						0.6,
						'rgba(255,120,120,0.8)',
						1,
						'rgba(255,0,0,1)'
					],
					'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 10, 12, 50],
					'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 12, 0.8]
				}
			}, 'waterway-label');

			// circle layer for points when zoomed in
			map.addLayer({
				id: 'dc-point',
				type: 'circle',
				source: 'dc-quakes',
				minzoom: 12,
				paint: {
					'circle-radius': ['interpolate', ['linear'], ['get', 'mag'], 1, 2, 6, 8],
					'circle-color': 'white',
					'circle-stroke-color': 'rgba(255,0,0,0.9)',
					'circle-stroke-width': 1,
					'circle-opacity': ['interpolate', ['linear'], ['zoom'], 12, 0, 14, 1]
				}
			});

				// Show popup when clicking a circle point
				map.on('click', 'dc-point', (e) => {
					const feature = e.features && e.features[0];
					if (!feature) return;
					const coords = (feature.geometry as any).coordinates.slice();
					const mag = feature.properties ? feature.properties.mag : undefined;
					const html = `<div><strong>Magnitude:</strong> ${mag ?? 'N/A'}<br/><strong>Coordinates:</strong> ${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}</div>`;
					new mapboxgl.Popup({ offset: 15 })
						.setLngLat(coords)
						.setHTML(html)
						.addTo(map);
				});

				// When clicking the heatmap, try to find nearby point features; otherwise prompt to zoom in
				map.on('click', 'dc-heat', (e) => {
					// search a small bbox around the click point for any rendered circle features
					const p = e.point;
					const bbox = [[p.x - 6, p.y - 6], [p.x + 6, p.y + 6]];
					const nearby = map.queryRenderedFeatures(bbox as [mapboxgl.PointLike, mapboxgl.PointLike], { layers: ['dc-point'] });
					if (nearby && nearby.length > 0) {
						const f = nearby[0];
						const coords = (f.geometry as any).coordinates.slice();
						const mag = f.properties ? f.properties.mag : undefined;
						const html = `<div><strong>Magnitude:</strong> ${mag ?? 'N/A'}<br/><strong>Coordinates:</strong> ${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}</div>`;
						new mapboxgl.Popup({ offset: 15 }).setLngLat(coords).setHTML(html).addTo(map);
					} else {
						new mapboxgl.Popup({ offset: 15 })
							.setLngLat(e.lngLat)
							.setHTML('<div><em>Zoom in to see individual points and details</em></div>')
							.addTo(map);
					}
				});

				// Change cursor to pointer when hovering heatmap or points
				map.on('mouseenter', 'dc-point', () => {
					map.getCanvas().style.cursor = 'pointer';
				});
				map.on('mouseleave', 'dc-point', () => {
					map.getCanvas().style.cursor = '';
				});
				map.on('mouseenter', 'dc-heat', () => {
					map.getCanvas().style.cursor = 'pointer';
				});
				map.on('mouseleave', 'dc-heat', () => {
					map.getCanvas().style.cursor = '';
				});
		});

		return () => {
			if (mapRef.current) {
				mapRef.current.remove();
				mapRef.current = null;
			}
		};
	}, []);

	return (
		<div ref={containerRef} style={{ position: 'absolute', inset: 0 }}>
			<div
				ref={mapContainerRef}
				style={{ width: size.width || '100%', height: size.height || '100%' }}
			/>
		</div>
	);
}
