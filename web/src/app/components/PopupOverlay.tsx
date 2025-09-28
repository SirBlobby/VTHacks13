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
			<div className="mapbox-popup-inner" style={{ background: 'var(--surface-1)', color: 'var(--text-primary)', padding: 8, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid var(--border-1)', minWidth: 200, maxWidth: 350 }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
					<div style={{ fontWeight: 700, fontSize: 14 }}>{popup.text ?? 'Details'}</div>
					<button aria-label="Close popup" onClick={() => { onClose(); }} style={{ background: 'var(--surface-2)', border: 'none', padding: 8, marginLeft: 8, cursor: 'pointer', borderRadius: 4, color: 'var(--text-secondary)' }}>
						✕
					</button>
				</div>
				{typeof popup.mag !== 'undefined' && <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}><strong style={{ color: 'var(--text-primary)' }}>Magnitude:</strong> {popup.mag}</div>}
				{popup.stats && popup.stats.count > 0 && (
					<div style={{ marginTop: 6, fontSize: 13 }}>
						<div style={{ fontWeight: 600, color: '#0066cc', marginBottom: 4 }}>
							📍 {popup.stats.count} crashes within {popup.stats.radiusMeters}m radius
						</div>
						{popup.stats.avg !== undefined && (
							<div style={{ marginBottom: 4, color: 'var(--text-secondary)' }}>
								<strong style={{ color: 'var(--text-primary)' }}>Severity Score:</strong> Avg {popup.stats.avg} (Min: {popup.stats.min}, Max: {popup.stats.max})
							</div>
						)}
						{popup.stats.severityCounts && (
							<div style={{ marginTop: 6 }}>
								<div style={{ fontWeight: 600, marginBottom: 2, color: 'var(--text-primary)' }}>Severity Breakdown:</div>
								<div style={{ marginLeft: 8, fontSize: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, color: 'var(--text-secondary)' }}>
									{popup.stats.severityCounts.fatal > 0 && <div>🔴 Fatal: {popup.stats.severityCounts.fatal}</div>}
									{popup.stats.severityCounts.majorInjury > 0 && <div>🟠 Major: {popup.stats.severityCounts.majorInjury}</div>}
									{popup.stats.severityCounts.minorInjury > 0 && <div>🟡 Minor: {popup.stats.severityCounts.minorInjury}</div>}
									{popup.stats.severityCounts.propertyOnly > 0 && <div>⚪ Property: {popup.stats.severityCounts.propertyOnly}</div>}
								</div>
							</div>
						)}
						{popup.stats.crashes && popup.stats.crashes.length > 0 && (
							<div style={{ marginTop: 8 }}>
								<div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Recent nearby incidents:</div>
								<div style={{ marginLeft: 8, fontSize: 11, maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border-2)', borderRadius: 4, padding: 4, background: 'var(--surface-2)' }}>
									{popup.stats.crashes.slice(0, 5)
										.filter(crash => crash && crash.severity && crash.address) // Filter out null/invalid crashes
										.map((crash, i) => (
										<div key={crash.id || i} style={{ marginTop: i > 0 ? 6 : 0, padding: 4, borderLeft: '2px solid var(--border-3)', paddingLeft: 6, backgroundColor: i % 2 === 0 ? 'var(--surface-3)' : 'transparent' }}>
											<div style={{ fontWeight: 600, fontSize: 12, color: crash.severity === 'Fatal' ? '#dc3545' : crash.severity === 'Major Injury' ? '#fd7e14' : crash.severity === 'Minor Injury' ? '#ffc107' : 'var(--text-tertiary)' }}>
												{crash.severity}
											</div>
											<div style={{ marginTop: 1, lineHeight: 1.3, color: 'var(--text-primary)' }}>{crash.address}</div>
											<div style={{ color: 'var(--text-muted)', marginTop: 1 }}>
												{crash.reportDate ? new Date(crash.reportDate).toLocaleDateString() : 'Date unknown'}
											</div>
											{(crash.totalVehicles > 0 || crash.totalPedestrians > 0 || crash.totalBicycles > 0) && (
												<div style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 1 }}>
													{crash.totalVehicles > 0 && `🚗${crash.totalVehicles} `}
													{crash.totalPedestrians > 0 && `🚶${crash.totalPedestrians} `}
													{crash.totalBicycles > 0 && `🚴${crash.totalBicycles} `}
												</div>
											)}
										</div>
									))}
								</div>
								{popup.stats.crashes.length > 5 && (
									<div style={{ textAlign: 'center', marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
										... and {popup.stats.crashes.length - 5} more crashes in this area
									</div>
								)}
							</div>
						)}
					</div>
				)}
				{popup.stats && popup.stats.count === 0 && (
					<div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 8, backgroundColor: 'var(--surface-2)', borderRadius: 4 }}>
						No crash data found within {popup.stats.radiusMeters || 500}m of this location
					</div>
				)}
			</div>
		</div>
	);
}
