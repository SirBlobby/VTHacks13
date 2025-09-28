"use client";

import React, { useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { PopupData } from './MapView';

interface Props {
	popup: PopupData;
	popupVisible: boolean;
	mapRef: React.MutableRefObject<mapboxgl.Map | null>;
	onClose: () => void;
	autoDismissMs?: number; // Auto-dismiss timeout in milliseconds, default 5000 (5 seconds)
}

export default function PopupOverlay({ popup, popupVisible, mapRef, onClose, autoDismissMs = 5000 }: Props) {
	const [isHovered, setIsHovered] = useState(false);
	const [timeLeft, setTimeLeft] = useState(autoDismissMs);
	const [popupPosition, setPopupPosition] = useState({ left: 0, top: 0, transform: 'translate(-50%, -100%)', arrowPosition: 'bottom' });

	// Calculate smart popup positioning
	const calculatePopupPosition = (clickPoint: mapboxgl.Point) => {
		if (typeof window === 'undefined') return { 
			left: clickPoint.x, 
			top: clickPoint.y, 
			transform: 'translate(-50%, -100%)',
			arrowPosition: 'bottom'
		};
		
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const popupWidth = 350; // max-width from styles
		const popupHeight = 200; // estimated height
		const padding = 20; // padding from screen edges
		
		let left = clickPoint.x;
		let top = clickPoint.y;
		let transform = '';
		let arrowPosition = 'bottom'; // where the arrow points (bottom = popup is above click)
		
		// Determine horizontal position
		if (clickPoint.x + popupWidth / 2 + padding > viewportWidth) {
			// Position to the left of cursor
			left = clickPoint.x - 10;
			transform = 'translateX(-100%)';
			arrowPosition = 'right';
		} else if (clickPoint.x - popupWidth / 2 < padding) {
			// Position to the right of cursor
			left = clickPoint.x + 10;
			transform = 'translateX(0%)';
			arrowPosition = 'left';
		} else {
			// Center horizontally
			left = clickPoint.x;
			transform = 'translateX(-50%)';
		}
		
		// Determine vertical position
		if (clickPoint.y - popupHeight - padding < 0) {
			// Position below cursor
			top = clickPoint.y + 10;
			transform += ' translateY(0%)';
			arrowPosition = arrowPosition === 'bottom' ? 'top' : arrowPosition;
		} else {
			// Position above cursor (default)
			top = clickPoint.y - 10;
			transform += ' translateY(-100%)';
		}
		
		return { left, top, transform, arrowPosition };
	};

	// Update popup position when popup data changes or map moves
	useEffect(() => {
		if (!popup || !mapRef.current) return;
		
		const map = mapRef.current;
		const updatePosition = () => {
			const clickPoint = map.project(popup.lngLat as any);
			const position = calculatePopupPosition(clickPoint);
			setPopupPosition(position);
		};
		
		// Update position initially
		updatePosition();
		
		// Update position when map moves or zooms
		map.on('move', updatePosition);
		map.on('zoom', updatePosition);
		
		return () => {
			map.off('move', updatePosition);
			map.off('zoom', updatePosition);
		};
	}, [popup, mapRef]);

	// Auto-dismiss timer with progress
	useEffect(() => {
		if (!popup || !popupVisible || isHovered) {
			setTimeLeft(autoDismissMs); // Reset timer when hovered
			return;
		}

		const interval = 50; // Update every 50ms for smooth progress
		const timer = setInterval(() => {
			setTimeLeft((prev) => {
				const newValue = prev - interval;
				if (newValue <= 0) {
					// Schedule onClose to run after the state update completes
					setTimeout(() => onClose(), 0);
					return 0;
				}
				return newValue;
			});
		}, interval);

		return () => clearInterval(timer);
	}, [popup, popupVisible, isHovered, onClose, autoDismissMs]);

	if (!popup) return null;
	const map = mapRef.current;
	if (!map) return null;

	return (
		<div
			role="dialog"
			aria-label="Feature details"
			className={`custom-popup ${popupVisible ? 'visible' : ''}`}
			style={{ 
				position: 'absolute', 
				left: Math.round(popupPosition.left), 
				top: Math.round(popupPosition.top), 
				transform: popupPosition.transform, 
				pointerEvents: popupVisible ? 'auto' : 'none',
				zIndex: 1000 
			}}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div className="mapbox-popup-inner" style={{ background: 'var(--surface-1)', color: 'var(--text-primary)', padding: 8, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid var(--border-1)', minWidth: 200, maxWidth: 350, position: 'relative', overflow: 'hidden' }}>
				{/* Auto-dismiss progress bar */}
				{!isHovered && popupVisible && (
					<div 
						style={{
							position: 'absolute',
							top: 0,
							left: 0,
							height: 2,
							backgroundColor: '#0066cc',
							width: `${(timeLeft / autoDismissMs) * 100}%`,
							transition: 'width 50ms linear',
							zIndex: 1
						}}
					/>
				)}
				
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
