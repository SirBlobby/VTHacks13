"use client";

import Map from 'react-map-gl/mapbox';

import 'mapbox-gl/dist/mapbox-gl.css';

export default function Home() {

	let width = window.innerWidth;
	let height = window.innerHeight;

  return (
	<div>
		<Map
			mapboxAccessToken="pk.eyJ1IjoicGllbG9yZDc1NyIsImEiOiJjbWcxdTd6c3AwMXU1MmtxMDh6b2l5amVrIn0.5Es0azrah23GX1e9tmbjGw"
			initialViewState={{
				longitude: -122.4,
				latitude: 37.8,
				zoom: 14
			}}
			style={{width, height}}
			mapStyle="mapbox://styles/mapbox/streets-v9"
		/>
	</div>
  );
}
