"use client";

// import React from 'react';
// import mapboxgl from 'mapbox-gl';

// interface Props { mapRef: React.MutableRefObject<mapboxgl.Map | null> }

// export default function ZoomControls({ mapRef }: Props) {
// 	return (
// 		<div style={{ position: 'absolute', top: 12, right: 12, zIndex: 3, display: 'flex', flexDirection: 'column', gap: 8 }}>
// 			<button className="zoom-btn" aria-label="Zoom in" title="Zoom in" onClick={() => { const map = mapRef.current; if (!map) return; map.easeTo({ zoom: map.getZoom() + 1 }); }}>+</button>
// 			<button className="zoom-btn" aria-label="Zoom out" title="Zoom out" onClick={() => { const map = mapRef.current; if (!map) return; map.easeTo({ zoom: map.getZoom() - 1 }); }}>-</button>
// 		</div>
// 	);
// }
