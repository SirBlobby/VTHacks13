"use client";

import React, { useEffect } from 'react';
import mapboxgl from 'mapbox-gl';

interface Props {
	mapRef: React.MutableRefObject<mapboxgl.Map | null>;
	position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
	profile?: 'mapbox/driving' | 'mapbox/walking' | 'mapbox/cycling';
	unit?: 'metric' | 'imperial';
}

export default function MapDirectionsControl({ mapRef, position = 'top-left', profile = 'mapbox/driving', unit = 'metric' }: Props) {
	useEffect(() => {
		let directionsControl: any = null;
		let cssEl: HTMLLinkElement | null = null;
		(async () => {
			if (!mapRef.current) return;
			// dynamic import so the package doesn't run during SSR
			// import the browser UMD build from the package dist to avoid server-only fs usage
			const MapboxDirections = (await import('@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.js')).default || (await import('@mapbox/mapbox-gl-directions/dist/mapbox-gl-directions.js'));
			// append plugin css
			cssEl = document.createElement('link');
			cssEl.rel = 'stylesheet';
			cssEl.href = 'https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-directions/v4.1.0/mapbox-gl-directions.css';
			document.head.appendChild(cssEl);

			directionsControl = new MapboxDirections({ accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN, unit, profile });
			mapRef.current.addControl(directionsControl, position);
		})();

		return () => {
			try {
				if (mapRef.current && directionsControl) mapRef.current.removeControl(directionsControl);
			} catch (e) {}
			if (cssEl && cssEl.parentNode) cssEl.parentNode.removeChild(cssEl);
		};
	}, [mapRef, position, profile, unit]);

	return null;
}
