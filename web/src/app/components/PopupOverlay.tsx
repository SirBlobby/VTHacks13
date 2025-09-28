"use client";

import React, { useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { PopupData } from './MapView';
import { fetchWeatherData, fetchCrashAnalysis, type WeatherData, type CrashAnalysisData } from '../../lib/flaskApi';

interface Props {
	popup: PopupData;
	popupVisible: boolean;
	mapRef: React.MutableRefObject<mapboxgl.Map | null>;
	onClose: () => void;
	autoDismissMs?: number; // Auto-dismiss timeout in milliseconds, default 5000 (5 seconds)
	onOpenModal?: (data: { weather?: WeatherData; crashAnalysis?: CrashAnalysisData; coordinates?: [number, number] }) => void;
}

export default function PopupOverlay({ popup, popupVisible, mapRef, onClose, autoDismissMs = 5000, onOpenModal }: Props) {
	const [isHovered, setIsHovered] = useState(false);
	const [timeLeft, setTimeLeft] = useState(autoDismissMs);
	const [popupPosition, setPopupPosition] = useState({ left: 0, top: 0, transform: 'translate(-50%, -100%)', arrowPosition: 'bottom' });
	const [aiDataLoaded, setAiDataLoaded] = useState(false);
	
	// API data states
	const [apiData, setApiData] = useState<{
		weather?: WeatherData;
		crashAnalysis?: CrashAnalysisData;
	}>({});
	const [apiLoading, setApiLoading] = useState(false);
	const [apiError, setApiError] = useState<string | null>(null);

	// Fetch API data when popup opens
	useEffect(() => {
		if (!popup || !popupVisible) {
			setApiData({});
			setApiError(null);
			setAiDataLoaded(false);
			return;
		}

		const fetchApiData = async () => {
			const [lat, lon] = [popup.lngLat[1], popup.lngLat[0]];
			
			setApiLoading(true);
			setApiError(null);
			setAiDataLoaded(false);
			
			try {
				// Fetch both weather and crash analysis data
				const [weatherData, crashAnalysisData] = await Promise.all([
					fetchWeatherData(lat, lon),
					fetchCrashAnalysis(lat, lon)
				]);
				
				setApiData({
					weather: weatherData,
					crashAnalysis: crashAnalysisData,
				});
				setAiDataLoaded(true); // Mark AI data as loaded
			} catch (error) {
				setApiError(error instanceof Error ? error.message : 'Unknown error occurred');
				setAiDataLoaded(true); // Still mark as "loaded" even if failed, so timer can start
			} finally {
				setApiLoading(false);
			}
		};

		// Fetch API data with a small delay to avoid too many requests
		const timeoutId = setTimeout(fetchApiData, 300);
		
		return () => clearTimeout(timeoutId);
	}, [popup, popupVisible]);

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
		
		// Estimate height based on content - larger when AI data is loaded
		let popupHeight = 180; // base height for basic popup
		if (apiData.weather || apiData.crashAnalysis) {
			// Use a more conservative estimate - the AI content can be quite long
			popupHeight = Math.min(500, viewportHeight * 0.75); // Cap at 75% of viewport height
		}
		
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
		
		// Determine vertical position - prioritize keeping popup in viewport
		const spaceAbove = clickPoint.y - padding;
		const spaceBelow = viewportHeight - clickPoint.y - padding;
		
		// Simple logic: try below first, then above, then force fit
		if (spaceBelow >= popupHeight) {
			// Position below cursor
			top = clickPoint.y + 15;
			arrowPosition = arrowPosition === 'right' || arrowPosition === 'left' ? arrowPosition : 'top';
		} else if (spaceAbove >= popupHeight) {
			// Position above cursor
			top = clickPoint.y - popupHeight - 15;
			arrowPosition = arrowPosition === 'right' || arrowPosition === 'left' ? arrowPosition : 'bottom';
		} else {
			// Force fit - use the side with more space
			if (spaceBelow > spaceAbove) {
				top = Math.max(padding, viewportHeight - popupHeight - padding);
			} else {
				top = padding;
			}
			arrowPosition = arrowPosition === 'right' || arrowPosition === 'left' ? arrowPosition : 'none';
		}
		
		// Always use translateX for horizontal, no vertical transform complications
		// The top position is already calculated to place the popup correctly

		// Final bounds checking - be very aggressive about keeping popup in viewport
		if (left < padding) left = padding;
		if (left + popupWidth > viewportWidth - padding) left = viewportWidth - popupWidth - padding;
		
		// Ensure popup stays within vertical bounds - no transform complications
		if (top < padding) {
			top = padding;
		}
		if (top + popupHeight > viewportHeight - padding) {
			top = Math.max(padding, viewportHeight - popupHeight - padding);
		}
		
		// Debug logging to understand positioning issues
		if (apiData.weather || apiData.crashAnalysis) {
			console.log('Popup positioning debug:', {
				clickPoint: { x: clickPoint.x, y: clickPoint.y },
				viewport: { width: viewportWidth, height: viewportHeight },
				popupHeight,
				spaceAbove: clickPoint.y - padding,
				spaceBelow: viewportHeight - clickPoint.y - padding,
				finalPosition: { left, top, transform }
			});
		}
		
		return { left, top, transform, arrowPosition };
	};

	// Update popup position when popup data changes, map moves, or AI data loads
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
	}, [popup, mapRef, apiData]); // Added apiData to dependencies

	// Immediate repositioning when AI data loads (separate from map events)
	useEffect(() => {
		if (!popup || !mapRef.current || !popupVisible) return;
		
		// Small delay to ensure DOM has updated with new content
		const timeoutId = setTimeout(() => {
			const map = mapRef.current!;
			const clickPoint = map.project(popup.lngLat as any);
			const position = calculatePopupPosition(clickPoint);
			setPopupPosition(position);
		}, 50);
		
		return () => clearTimeout(timeoutId);
	}, [apiData.weather, apiData.crashAnalysis]); // Trigger specifically when AI data loads

	// Auto-dismiss timer with progress - only starts after AI data is loaded
	useEffect(() => {
		if (!popup || !popupVisible || isHovered || !aiDataLoaded) {
			setTimeLeft(autoDismissMs); // Reset timer when conditions aren't met
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
	}, [popup, popupVisible, isHovered, aiDataLoaded, onClose, autoDismissMs]);

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
			<div className="mapbox-popup-inner" style={{ 
				background: 'var(--surface-1)', 
				color: 'var(--text-primary)', 
				padding: 8, 
				borderRadius: 8, 
				boxShadow: '0 8px 24px rgba(0,0,0,0.15)', 
				border: '1px solid var(--border-1)', 
				minWidth: 200, 
				maxWidth: 350, 
				maxHeight: '75vh', // Prevent popup from being too tall
				position: 'relative'
			}}>
				{/* Auto-dismiss progress bar - only show after AI data is loaded */}
				{!isHovered && popupVisible && aiDataLoaded && (
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
				
				{/* Scrollable content container */}
				<div style={{ maxHeight: 'calc(75vh - 40px)', overflowY: 'auto' }}>
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

				{/* API Data Section */}
				{(apiLoading || apiData.weather || apiData.crashAnalysis || apiError) && (
					<div style={{ marginTop: 12, borderTop: '1px solid var(--border-2)', paddingTop: 8 }}>
						{apiLoading && (
							<div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
								<div style={{ 
									width: 16, 
									height: 16, 
									border: '2px solid var(--border-3)', 
									borderTop: '2px solid var(--text-primary)', 
									borderRadius: '50%', 
									animation: 'spin 1s linear infinite' 
								}} />
								Loading additional data...
							</div>
						)}

						{apiError && (
							<div style={{ 
								fontSize: 12, 
								color: '#dc3545', 
								backgroundColor: '#ffeaea', 
								padding: 6, 
								borderRadius: 4, 
								border: '1px solid #f5c6cb' 
							}}>
								⚠️ {apiError}
							</div>
						)}

						{/* Weather Data */}
						{apiData.weather && (
							<div style={{ marginBottom: 8 }}>
								<div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)', fontSize: 13 }}>
									🌤️ Current Weather
								</div>
								<div style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
									{apiData.weather.summary && (
										<div style={{ marginBottom: 4, fontStyle: 'italic' }}>
											{apiData.weather.summary}
										</div>
									)}
									{apiData.weather.description && (
										<div>Conditions: {apiData.weather.description}</div>
									)}
									{apiData.weather.precipitation !== undefined && (
										<div>Precipitation: {apiData.weather.precipitation} mm/h</div>
									)}
									{apiData.weather.windSpeed !== undefined && (
										<div>Wind Speed: {apiData.weather.windSpeed} km/h</div>
									)}
									{apiData.weather.timeOfDay && (
										<div>Time of Day: {apiData.weather.timeOfDay}</div>
									)}
								</div>
							</div>
						)}

						{/* Crash Analysis */}
						{apiData.crashAnalysis && (
							<div>
								<div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)', fontSize: 13 }}>
									📊 AI Analysis
								</div>
								<div style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
									{apiData.crashAnalysis.riskLevel && (
										<div style={{ 
											marginBottom: 6,
											padding: 6,
											borderRadius: 4,
											backgroundColor: apiData.crashAnalysis.riskLevel === 'high' ? '#ffeaea' : 
															  apiData.crashAnalysis.riskLevel === 'medium' ? '#fff3cd' : '#d4edda',
											color: apiData.crashAnalysis.riskLevel === 'high' ? '#721c24' : 
												   apiData.crashAnalysis.riskLevel === 'medium' ? '#856404' : '#155724',
											fontWeight: 600
										}}>
											Risk Level: {apiData.crashAnalysis.riskLevel.toUpperCase()}
										</div>
									)}
									{apiData.crashAnalysis.recommendations && apiData.crashAnalysis.recommendations.length > 0 && (
										<div>
											<div style={{ fontWeight: 600, marginBottom: 3, fontSize: 12 }}>Key Recommendations:</div>
											<div style={{ fontSize: 11, maxHeight: 120, overflowY: 'auto' }}>
												{apiData.crashAnalysis.recommendations.slice(0, 4).map((rec: string, i: number) => (
													<div key={i} style={{ marginBottom: 3, lineHeight: 1.3 }}>
														• {rec}
													</div>
												))}
											</div>
										</div>
									)}
									
									{/* View Details Button */}
									<div style={{ marginTop: 8, textAlign: 'center' }}>
										<button
											onClick={() => onOpenModal?.({
												weather: apiData.weather,
												crashAnalysis: apiData.crashAnalysis,
												coordinates: popup ? [popup.lngLat[0], popup.lngLat[1]] : undefined
											})}
											style={{
												backgroundColor: 'var(--accent-primary)',
												color: 'white',
												border: 'none',
												padding: '6px 12px',
												borderRadius: 4,
												fontSize: 11,
												fontWeight: 600,
												cursor: 'pointer',
												width: '100%'
											}}
											onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-primary-hover)'}
											onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-primary)'}
										>
											📊 View Full Analysis
										</button>
									</div>
								</div>
							</div>
						)}
					</div>
				)}
				</div> {/* Close scrollable container */}
			</div>

			{/* Add CSS for spinner animation */}
			<style jsx>{`
				@keyframes spin {
					0% { transform: rotate(0deg); }
					100% { transform: rotate(360deg); }
				}
			`}</style>
		</div>
	);
}
