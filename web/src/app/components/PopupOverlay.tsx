"use client";

import React from 'react';
import mapboxgl from 'mapbox-gl';
import type { PopupData } from './MapView';

interface Props {
	popup: PopupData;
	popupVisible: boolean;
	mapRef: React.MutableRefObject<mapboxgl.Map | null>;
	onClose: () => void;
}

export default function PopupOverlay({ popup, popupVisible, mapRef, onClose }: Props) {
	if (!popup) return null;
	const map = mapRef.current;
	if (!map) return null;

	const p = map.project(popup.lngLat as any);

	return (
		<div
			role="dialog"
			aria-label="Feature details"
			className={`custom-popup ${popupVisible ? 'visible' : ''}`}
			style={{ position: 'absolute', left: Math.round(p.x), top: Math.round(p.y), transform: 'translate(-50%, -100%)', pointerEvents: popupVisible ? 'auto' : 'none' }}
		>
			<div className="mapbox-popup-inner" style={{ background: 'var(--background)', color: 'var(--foreground)', padding: 8, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', border: '1px solid rgba(0,0,0,0.08)', minWidth: 180 }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
					<div style={{ fontWeight: 700 }}>{popup.text ?? 'Details'}</div>
					<button aria-label="Close popup" onClick={() => { onClose(); }} style={{ background: 'transparent', border: 'none', padding: 8, marginLeft: 8, cursor: 'pointer' }}>
						✕
					</button>
				</div>
				{typeof popup.mag !== 'undefined' && <div style={{ marginTop: 6 }}><strong>Magnitude:</strong> {popup.mag}</div>}
				{popup.stats && popup.stats.count > 0 && (
					<div style={{ marginTop: 6, fontSize: 13 }}>
						<div><strong>Nearby points:</strong> {popup.stats.count} (within {popup.stats.radiusMeters}m)</div>
						<div><strong>Avg:</strong> {popup.stats.avg} &nbsp; <strong>Min:</strong> {popup.stats.min} &nbsp; <strong>Max:</strong> {popup.stats.max}</div>
					</div>
				)}
			</div>
		</div>
	);
}
