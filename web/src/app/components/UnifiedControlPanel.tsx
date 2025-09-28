"use client";

import React, { useState, useEffect } from 'react';
import { UseCrashDataResult } from '../hooks/useCrashData';
import { getCircuitBreakerStatus } from '../../lib/crashMagnitudeApi';

interface UnifiedControlPanelProps {
	// Map controls props
	mapStyleChoice: 'dark' | 'streets';
	onChangeStyle: (v: 'dark' | 'streets') => void;
	heatVisible: boolean;
	onToggleHeat: (v: boolean) => void;
	pointsVisible: boolean;
	onTogglePoints: (v: boolean) => void;
	heatRadius: number;
	onChangeRadius: (v: number) => void;
	heatIntensity: number;
	onChangeIntensity: (v: number) => void;
	gradientRoutes: boolean;
	onToggleGradientRoutes: (v: boolean) => void;
	useAIMagnitudes: boolean;
	onToggleAIMagnitudes: (v: boolean) => void;
	
	// Crash data controls props
	crashDataHook: UseCrashDataResult;
	onDataLoaded?: (dataCount: number) => void;
}

export default function UnifiedControlPanel({
	mapStyleChoice,
	onChangeStyle,
	heatVisible,
	onToggleHeat,
	pointsVisible,
	onTogglePoints,
	heatRadius,
	onChangeRadius,
	heatIntensity,
	onChangeIntensity,
	gradientRoutes,
	onToggleGradientRoutes,
	useAIMagnitudes,
	onToggleAIMagnitudes,
	crashDataHook,
	onDataLoaded
}: UnifiedControlPanelProps) {
	// Panel open/closed state with localStorage persistence
	const getInitialPanelState = () => {
		// Always start with default values during SSR
		return true;
	};
	
	const getInitialMapControlsState = () => {
		// Always start with default values during SSR
		return true;
	};
	
	const getInitialCrashDataState = () => {
		// Always start with default values during SSR
		return false;
	};

	const [isPanelOpen, setIsPanelOpen] = useState(getInitialPanelState);
	const [isMapControlsSectionOpen, setIsMapControlsSectionOpen] = useState(getInitialMapControlsState);
	const [isCrashDataSectionOpen, setIsCrashDataSectionOpen] = useState(getInitialCrashDataState);
	const [isHydrated, setIsHydrated] = useState(false);
	const [aiApiStatus, setAiApiStatus] = useState<{ isOpen: boolean; failures: number }>({ isOpen: false, failures: 0 });
	
	// Load localStorage values after hydration
	useEffect(() => {
		const panelValue = window.localStorage.getItem('unified_panel_open');
		const mapControlsValue = window.localStorage.getItem('map_controls_section_open');
		const crashDataValue = window.localStorage.getItem('crash_data_section_open');
		
		if (panelValue !== null) {
			setIsPanelOpen(panelValue === '1');
		}
		if (mapControlsValue !== null) {
			setIsMapControlsSectionOpen(mapControlsValue === '1');
		}
		if (crashDataValue !== null) {
			setIsCrashDataSectionOpen(crashDataValue === '1');
		}
		
		setIsHydrated(true);
	}, []);
	
	// Check AI API status when AI magnitudes are enabled
	useEffect(() => {
		if (useAIMagnitudes) {
			const checkApiStatus = () => {
				const status = getCircuitBreakerStatus();
				setAiApiStatus(status);
			};
			
			// Check immediately
			checkApiStatus();
			
			// Check every 30 seconds
			const interval = setInterval(checkApiStatus, 30000);
			return () => clearInterval(interval);
		}
	}, [useAIMagnitudes]);
	
	// Crash data state
	const { data, loading, error, pagination, loadMore, refresh, yearFilter, setYearFilter } = crashDataHook;
	const [currentYear, setCurrentYear] = useState('2024'); // Default to prevent hydration mismatch
	const [selectedYear, setSelectedYear] = useState<string>('2024'); // Default value

	// Set actual current year and selected year after hydration
	useEffect(() => {
		const actualCurrentYear = new Date().getFullYear().toString();
		setCurrentYear(actualCurrentYear);
		setSelectedYear(yearFilter || actualCurrentYear);
	}, [yearFilter]);

	React.useEffect(() => {
		if (onDataLoaded) {
			onDataLoaded(data.length);
		}
	}, [data.length, onDataLoaded]);

	const handleYearChange = (year: string) => {
		setSelectedYear(year);
		const filterYear = year === 'all' ? null : year;
		if (setYearFilter) {
			setYearFilter(filterYear);
		}
	};

	const toggleMainPanel = (next: boolean) => {
		setIsPanelOpen(next);
		try { 
			window.localStorage.setItem('unified_panel_open', next ? '1' : '0'); 
		} catch (e) {}
	};

	const toggleMapControls = (next: boolean) => {
		setIsMapControlsSectionOpen(next);
		try { 
			window.localStorage.setItem('map_controls_section_open', next ? '1' : '0'); 
		} catch (e) {}
	};

	const toggleCrashData = (next: boolean) => {
		setIsCrashDataSectionOpen(next);
		try { 
			window.localStorage.setItem('crash_data_section_open', next ? '1' : '0'); 
		} catch (e) {}
	};

	const panelStyle = {
		backgroundColor: 'var(--panel-darker)',
		color: '#f9fafb',
		border: '2px solid var(--panel-medium)',
		boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)',
		backdropFilter: 'blur(20px)',
		zIndex: 20,
		fontWeight: '500'
	};

	const selectStyle = {
		backgroundColor: 'var(--panel-dark)',
		color: '#f9fafb',
		border: '2px solid var(--panel-medium)',
		fontSize: '14px',
		fontWeight: '500',
		padding: '8px 12px',
		borderRadius: '8px',
		outline: 'none'
	};

	const sectionHeaderStyle = {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: '12px',
		paddingBottom: '8px',
		borderBottom: '1px solid var(--panel-medium)'
	};

	const toggleButtonStyle = {
		borderRadius: 6,
		padding: '6px 10px',
		backgroundColor: 'var(--panel-dark)',
		color: '#e5e7eb',
		border: '1px solid var(--panel-medium)',
		fontWeight: '600',
		cursor: 'pointer',
		fontSize: '12px'
	};

	return (
		<div className="map-control" style={{
			...panelStyle,
			position: 'absolute',
			bottom: '50px',
			right: '12px',
			width: '280px',
			maxHeight: '80vh',
			overflowY: 'auto'
		}}>
			{/* Main panel header */}
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
				<div style={{ fontWeight: 700, fontSize: '16px', color: '#f9fafb' }}>Control Panel</div>
				<button 
					aria-expanded={isPanelOpen} 
					aria-label={isPanelOpen ? 'Collapse panel' : 'Expand panel'} 
					onClick={() => toggleMainPanel(!isPanelOpen)} 
					style={{ 
						borderRadius: 8, 
						padding: '8px 12px',
						backgroundColor: 'var(--panel-dark)',
						color: '#e5e7eb',
						border: '2px solid var(--panel-medium)',
						fontWeight: '600',
						cursor: 'pointer'
					}}
				>
					{isPanelOpen ? '−' : '+'}
				</button>
			</div>

			{isPanelOpen && (
				<>
					{/* Map Controls Section */}
					<div style={{ marginBottom: '20px' }}>
						<div style={sectionHeaderStyle}>
							<div style={{ fontWeight: 600, fontSize: '14px', color: '#f9fafb' }}>Map Controls</div>
							<button 
								onClick={() => toggleMapControls(!isMapControlsSectionOpen)}
								style={toggleButtonStyle}
								aria-expanded={isMapControlsSectionOpen}
							>
								{isMapControlsSectionOpen ? '−' : '+'}
							</button>
						</div>

						{isMapControlsSectionOpen && (
							<div style={{ paddingLeft: '8px' }}>
								<div className="mc-row">
									<label className="mc-label">Style</label>
									<select className="map-select" style={selectStyle} value={mapStyleChoice} onChange={(e) => onChangeStyle(e.target.value as 'dark' | 'streets')}>
										<option value="dark">Dark</option>
										<option value="streets">Streets</option>
									</select>
								</div>
								
								<div className="mc-row">
									<label className="mc-label">Heatmap</label>
									<input type="checkbox" checked={heatVisible} onChange={(e) => onToggleHeat(e.target.checked)} />
								</div>

								<div className="mc-row">
									<label className="mc-label">Points</label>
									<input type="checkbox" checked={pointsVisible} onChange={(e) => onTogglePoints(e.target.checked)} />
								</div>

								<div className="mc-row">
									<label className="mc-label">Gradient Routes</label>
									<input type="checkbox" checked={gradientRoutes} onChange={(e) => onToggleGradientRoutes(e.target.checked)} />
								</div>

								<div className="mc-row">
									<label className="mc-label">
										AI Magnitudes 🤖
										<span style={{
											fontSize: 8,
											padding: '2px 6px',
											borderRadius: 4,
											marginLeft: 8,
											backgroundColor: aiApiStatus.isOpen ? '#d4edda' : '#f8d7da',
											color: aiApiStatus.isOpen ? '#155724' : '#721c24'
										}}>
											{aiApiStatus.isOpen ? 'Available' : `Unavailable (${aiApiStatus.failures} failures)`}
										</span>
									</label>
									<input type="checkbox" checked={useAIMagnitudes} onChange={(e) => onToggleAIMagnitudes(e.target.checked)} />
								</div>
								
								{useAIMagnitudes && (
									<div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: -4, marginBottom: 8, lineHeight: 1.3 }}>
										Uses AI to predict crash severity. Falls back to traditional calculation if API unavailable.
									</div>
								)}

								<div style={{ marginBottom: 6 }}>
									<label style={{ display: 'block', fontSize: 12 }}>Radius: {heatRadius}</label>
									<input className="mc-range" type="range" min={5} max={100} value={heatRadius} onChange={(e) => onChangeRadius(Number(e.target.value))} style={{ width: '100%' }} />
								</div>

								<div style={{ marginBottom: 6 }}>
									<label style={{ display: 'block', fontSize: 12 }}>Intensity: {heatIntensity}</label>
									<input className="mc-range" type="range" min={0.1} max={5} step={0.1} value={heatIntensity} onChange={(e) => onChangeIntensity(Number(e.target.value))} style={{ width: '100%' }} />
								</div>

								<div style={{ fontSize: 11, opacity: 0.9, marginTop: 8 }}>Tip: switching style will reapply layers.</div>
							</div>
						)}
					</div>

					{/* Crash Data Controls Section */}
					<div>
						<div style={sectionHeaderStyle}>
							<div style={{ fontWeight: 600, fontSize: '14px', color: '#f9fafb' }}>Crash Data</div>
							<button 
								onClick={() => toggleCrashData(!isCrashDataSectionOpen)}
								style={toggleButtonStyle}
								aria-expanded={isCrashDataSectionOpen}
							>
								{isCrashDataSectionOpen ? '−' : '+'}
							</button>
						</div>

						{isCrashDataSectionOpen && (
							<div style={{ paddingLeft: '8px' }}>
								{/* Crash Density Legend */}
								<div style={{ marginBottom: '16px' }}>
									<div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px', color: '#f9fafb' }}>Density Legend</div>
									<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
										<div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
											<div style={{ width: 18, height: 12, background: 'rgba(0,0,0,0)', border: '1px solid rgba(249, 250, 251, 0.4)', borderRadius: '2px' }} />
											<div style={{ width: 18, height: 12, background: 'rgba(255,255,0,0.8)', borderRadius: '2px' }} />
											<div style={{ width: 18, height: 12, background: 'rgba(255,165,0,0.85)', borderRadius: '2px' }} />
											<div style={{ width: 18, height: 12, background: 'rgba(255,69,0,0.9)', borderRadius: '2px' }} />
											<div style={{ width: 18, height: 12, background: 'rgba(255,0,0,0.95)', borderRadius: '2px' }} />
											<div style={{ width: 18, height: 12, background: 'rgba(139,0,0,1)', borderRadius: '2px' }} />
										</div>
										<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
											<span style={{ fontSize: 11, color: '#ffffff', fontWeight: '600' }}>Low</span>
											<span style={{ fontSize: 11, color: '#ffffff', fontWeight: '600' }}>High</span>
										</div>
									</div>
								</div>
								
								{/* Year Filter */}
								<div style={{ marginBottom: '16px' }}>
									<label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#e5e7eb', fontWeight: '600' }}>
										Filter by Year:
									</label>
									<select 
										value={yearFilter || ''} 
										onChange={(e) => handleYearChange(e.target.value)}
										style={selectStyle}
									>
										<option value="">All Years</option>
										{Array.from({ length: 2025 - 2015 + 1 }, (_, i) => 2015 + i).map(year => (
											<option key={year} value={year} style={{ backgroundColor: 'var(--panel-dark)', color: '#f9fafb' }}>
												{year}
											</option>
										))}
									</select>
								</div>
								
								{/* Data Status */}
								<div style={{ marginBottom: '12px', color: '#f9fafb', fontWeight: '600', fontSize: '14px' }}>
									Loaded: {data.length.toLocaleString()} crashes
									{yearFilter && ` (${yearFilter})`}
								</div>
								
								{pagination && !yearFilter && (
									<div style={{ marginBottom: '8px', fontSize: '12px', color: '#9ca3af', fontWeight: '500' }}>
										Page {pagination.page} of {pagination.totalPages}
										<br />
										Total: {pagination.total.toLocaleString()} crashes
									</div>
								)}
								
								{pagination && yearFilter && (
									<div style={{ marginBottom: '8px', fontSize: '12px', color: '#9ca3af', fontWeight: '500' }}>
										All crashes for {yearFilter} loaded
									</div>
								)}
								
								{loading && (
									<div style={{ 
										marginBottom: '8px', 
										color: '#fbbf24',
										fontWeight: '600',
										fontSize: '13px'
									}}>
										Loading...
									</div>
								)}
								
								{error && (
									<div style={{ 
										marginBottom: '8px', 
										color: '#f87171', 
										fontSize: '12px',
										fontWeight: '600'
									}}>
										Error: {error}
									</div>
								)}
								
								{/* Action Buttons */}
								<div style={{ display: 'flex', gap: '8px' }}>
									{pagination?.hasNext && !yearFilter && (
										<button
											onClick={loadMore}
											disabled={loading}
											style={{
												backgroundColor: loading ? 'rgba(102, 102, 102, 0.8)' : 'var(--panel-dark)',
												color: 'white',
												border: '1px solid var(--panel-medium)',
												padding: '6px 12px',
												borderRadius: '6px',
												fontSize: '12px',
												cursor: loading ? 'not-allowed' : 'pointer',
												transition: 'background-color 0.2s ease'
											}}
										>
											Load More
										</button>
									)}
									
									<button
										onClick={refresh}
										disabled={loading}
										style={{
											backgroundColor: loading ? 'rgba(102, 102, 102, 0.8)' : 'var(--panel-dark)',
											color: 'white',
											border: '1px solid var(--panel-medium)',
											padding: '6px 12px',
											borderRadius: '6px',
											fontSize: '12px',
											cursor: loading ? 'not-allowed' : 'pointer',
											transition: 'background-color 0.2s ease'
										}}
									>
										Refresh
									</button>
								</div>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}