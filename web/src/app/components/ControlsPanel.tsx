"use client";

import React from 'react';

interface ControlsPanelProps {
	panelOpen: boolean;
	onTogglePanel: (next: boolean) => void;
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
}

export default function ControlsPanel({ panelOpen, onTogglePanel, mapStyleChoice, onChangeStyle, heatVisible, onToggleHeat, pointsVisible, onTogglePoints, heatRadius, onChangeRadius, heatIntensity, onChangeIntensity, gradientRoutes, onToggleGradientRoutes }: ControlsPanelProps) {
	const panelStyle = {
		backgroundColor: 'var(--panel-darker)',
		color: '#f9fafb',
		border: '2px solid var(--panel-medium)',
		boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)',
		backdropFilter: 'blur(20px)',
		zIndex: 20, // Ensure proper layering
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

	return (
		<div className="map-control" style={panelStyle}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
				<div style={{ fontWeight: 700, fontSize: '16px', color: '#f9fafb' }}>Map Controls</div>
				<button aria-expanded={panelOpen} aria-label={panelOpen ? 'Collapse panel' : 'Expand panel'} onClick={() => onTogglePanel(!panelOpen)} 
					style={{ 
						borderRadius: 8, 
						padding: '8px 12px',
						backgroundColor: 'var(--panel-dark)',
						color: '#e5e7eb',
						border: '2px solid var(--panel-medium)',
						fontWeight: '600',
						cursor: 'pointer'
					}}>{panelOpen ? '−' : '+'}</button>
			</div>

			{panelOpen && (
				<>
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

					<div style={{ marginBottom: 6 }}>
						<label style={{ display: 'block', fontSize: 12 }}>Radius: {heatRadius}</label>
						<input className="mc-range" type="range" min={5} max={100} value={heatRadius} onChange={(e) => onChangeRadius(Number(e.target.value))} style={{ width: '100%' }} />
					</div>

					<div style={{ marginBottom: 6 }}>
						<label style={{ display: 'block', fontSize: 12 }}>Intensity: {heatIntensity}</label>
						<input className="mc-range" type="range" min={0.1} max={5} step={0.1} value={heatIntensity} onChange={(e) => onChangeIntensity(Number(e.target.value))} style={{ width: '100%' }} />
					</div>

					<div style={{ fontSize: 11, opacity: 0.9 }}>Tip: switching style will reapply layers.</div>
				</>
			)}
		</div>
	);
}
