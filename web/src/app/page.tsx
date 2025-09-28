"use client";

import React, { useRef, useState } from 'react';
import MapView, { PopupData } from './components/MapView';
import ControlsPanel from './components/ControlsPanel';
import PopupOverlay from './components/PopupOverlay';
import MapNavigationControl from './components/MapNavigationControl';
import DirectionsSidebar from './components/DirectionsSidebar';
import CrashDataControls from './components/CrashDataControls';
import { useCrashData } from './hooks/useCrashData';

export default function Home() {
	const mapRef = useRef<any>(null);
	const [heatVisible, setHeatVisible] = useState(true);
	const [pointsVisible, setPointsVisible] = useState(false);
	const [mapStyleChoice, setMapStyleChoice] = useState<'dark' | 'streets'>('dark');
	const [heatRadius, setHeatRadius] = useState(16);
	const [heatIntensity, setHeatIntensity] = useState(1);
	const [panelOpen, setPanelOpen] = useState<boolean>(() => {
		try { const v = typeof window !== 'undefined' ? window.localStorage.getItem('map_panel_open') : null; return v === null ? true : v === '1'; } catch (e) { return true; }
	});
	const [popup, setPopup] = useState<PopupData>(null);
	const [popupVisible, setPopupVisible] = useState(false);
	const [isMapPickingMode, setIsMapPickingMode] = useState(false);
	
	// Shared crash data state - load all data for filtered year
	const crashDataHook = useCrashData({ autoLoad: true });

	return (
		<div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'row' }}>
			<div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
				{/* Render sidebar as an overlay inside the map container so collapsing doesn't shift layout */}
				<div style={{ position: 'absolute', left: 0, top: 0, height: '100%', zIndex: 40, pointerEvents: 'auto' }}>
					<DirectionsSidebar 
						mapRef={mapRef} 
						profile="mapbox/driving" 
						onMapPickingModeChange={setIsMapPickingMode}
					/>
				</div>
				<ControlsPanel
					panelOpen={panelOpen}
					onTogglePanel={(next) => { setPanelOpen(next); try { window.localStorage.setItem('map_panel_open', next ? '1' : '0'); } catch (e) {} }}
					mapStyleChoice={mapStyleChoice}
					onChangeStyle={(v) => setMapStyleChoice(v)}
					heatVisible={heatVisible}
					onToggleHeat={(v) => setHeatVisible(v)}
					pointsVisible={pointsVisible}
					onTogglePoints={(v) => setPointsVisible(v)}
					heatRadius={heatRadius}
					onChangeRadius={(v) => setHeatRadius(v)}
					heatIntensity={heatIntensity}
					onChangeIntensity={(v) => setHeatIntensity(v)}
				/>

				<MapView
					mapStyleChoice={mapStyleChoice}
					heatRadius={heatRadius}
					heatIntensity={heatIntensity}
					heatVisible={heatVisible}
					pointsVisible={pointsVisible}
					useRealCrashData={true}
					crashData={crashDataHook.data}
					crashDataHook={crashDataHook}
					isMapPickingMode={isMapPickingMode}
					onMapReady={(m) => { mapRef.current = m; }}
					onPopupCreate={(p) => { setPopupVisible(false); setPopup(p); requestAnimationFrame(() => setPopupVisible(true)); }}
				/>
				
				{/* Native Mapbox navigation control (zoom + compass) */}
				<MapNavigationControl mapRef={mapRef} position="top-right" />
				
				{/* Crash data loading controls with integrated crash density legend */}
				<CrashDataControls crashDataHook={crashDataHook} />
				<PopupOverlay popup={popup} popupVisible={popupVisible} mapRef={mapRef} onClose={() => { setPopupVisible(false); setTimeout(() => setPopup(null), 220); }} />
			</div>
		</div>
	);
}