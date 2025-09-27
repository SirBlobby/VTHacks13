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
}

export default function ControlsPanel({ panelOpen, onTogglePanel, mapStyleChoice, onChangeStyle, heatVisible, onToggleHeat, pointsVisible, onTogglePoints, heatRadius, onChangeRadius, heatIntensity, onChangeIntensity }: ControlsPanelProps) {
	return (
		<div className="map-control">
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
				<div style={{ fontWeight: 700 }}>Map Controls</div>
				<button aria-expanded={panelOpen} aria-label={panelOpen ? 'Collapse panel' : 'Expand panel'} onClick={() => onTogglePanel(!panelOpen)} style={{ borderRadius: 6, padding: '4px 8px' }}>{panelOpen ? '−' : '+'}</button>
			</div>

			{panelOpen && (
				<>
					<div className="mc-row">
						<label className="mc-label">Style</label>
						<select className="map-select" value={mapStyleChoice} onChange={(e) => onChangeStyle(e.target.value as 'dark' | 'streets')}>
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
