"use client";

import React, { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';

type Position = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

interface Props {
	mapRef: React.MutableRefObject<mapboxgl.Map | null>;
	position?: Position;
	showCompass?: boolean;
	showZoom?: boolean;
	visualizePitch?: boolean;
	style?: React.CSSProperties;
}

export default function MapNavigationControl({ mapRef, position = 'top-right', showCompass = true, showZoom = true, visualizePitch = false, style }: Props) {
	useEffect(() => {
		const map = mapRef.current;
		if (!map) return;

		const nav = new mapboxgl.NavigationControl({ showCompass, showZoom, visualizePitch });
		map.addControl(nav, position);

		return () => {
			try { map.removeControl(nav); } catch (e) {}
		};
	}, [mapRef, position, showCompass, showZoom, visualizePitch]);

	// the control is rendered by mapbox, so this component itself renders nothing
	return null;
}
