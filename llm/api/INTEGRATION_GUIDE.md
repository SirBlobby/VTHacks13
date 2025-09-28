# Flask API Integration Guide for Next.js

## 🚀 Flask API Server

Your Flask API server is now ready and running on **`http://localhost:5001`**

### 🔌 Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check endpoint |
| `GET` | `/api/weather?lat=X&lon=Y` | Get weather conditions |
| `POST` | `/api/analyze-crashes` | Analyze crash patterns at location |
| `POST` | `/api/find-safe-route` | Find safest route between points |
| `POST` | `/api/get-single-route` | Get single route with safety analysis |

---

## 📦 Starting the Server

```bash
cd /path/to/VTHacks13/llm
python api/flask_server.py
```

The server will start on `http://localhost:5001` with the following services:
- ✅ MongoDB connection to crash database
- ✅ Route safety analysis 
- ✅ Weather API integration (Open-Meteo)
- ✅ Gemini AI for safety recommendations

---

## 🔧 Next.js Integration

### 1. Install Dependencies

```bash
npm install axios  # or use fetch API
```

### 2. Create API Client

Create `lib/api-client.js`:

```javascript
const API_BASE_URL = 'http://localhost:5001/api';

// Health Check
export async function checkAPIHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);
  return response.json();
}

// Weather API
export async function getWeather(lat, lon) {
  const response = await fetch(`${API_BASE_URL}/weather?lat=${lat}&lon=${lon}`);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch weather');
  }
  
  return data;
}

// Crash Analysis
export async function analyzeCrashes(lat, lon, radius = 1.0) {
  const response = await fetch(`${API_BASE_URL}/analyze-crashes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, radius })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Failed to analyze crashes');
  }
  
  return data;
}

// Safe Route Finding
export async function findSafeRoute(startLat, startLon, endLat, endLon) {
  const response = await fetch(`${API_BASE_URL}/find-safe-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_lat: startLat,
      start_lon: startLon,
      end_lat: endLat,
      end_lon: endLon
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Failed to find safe route');
  }
  
  return data;
}

// Single Route
export async function getSingleRoute(startLat, startLon, endLat, endLon, profile = 'driving') {
  const response = await fetch(`${API_BASE_URL}/get-single-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start_lat: startLat,
      start_lon: startLon,
      end_lat: endLat,
      end_lon: endLon,
      profile
    })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Failed to get route');
  }
  
  return data;
}
```

### 3. Example React Component

Create `components/SafetyAnalysis.jsx`:

```jsx
import { useState } from 'react';
import { analyzeCrashes, findSafeRoute, getWeather } from '../lib/api-client';

export default function SafetyAnalysis() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Example: Analyze crashes around Virginia Tech
      const lat = 37.2284;
      const lon = -80.4234;
      const radius = 2.0;
      
      // Get crash analysis
      const crashData = await analyzeCrashes(lat, lon, radius);
      
      // Get safe route (Virginia Tech to Downtown Blacksburg)
      const routeData = await findSafeRoute(lat, lon, 37.2297, -80.4139);
      
      // Get weather
      const weatherData = await getWeather(lat, lon);
      
      setResults({
        crashes: crashData,
        route: routeData,
        weather: weatherData
      });
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Safety Analysis</h2>
      
      <button 
        onClick={handleAnalyze}
        disabled={loading}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {loading ? 'Analyzing...' : 'Analyze Safety'}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          Error: {error}
        </div>
      )}

      {results && (
        <div className="mt-6 space-y-4">
          {/* Crash Analysis Results */}
          <div className="p-4 bg-gray-100 rounded">
            <h3 className="font-bold text-lg">Crash Analysis</h3>
            <p>Total crashes: {results.crashes.crash_summary.total_crashes}</p>
            <p>Total casualties: {results.crashes.crash_summary.total_casualties}</p>
            <p>Weather: {results.crashes.weather.summary}</p>
          </div>

          {/* Route Results */}
          <div className="p-4 bg-blue-100 rounded">
            <h3 className="font-bold text-lg">Safe Route</h3>
            <p>Distance: {results.route.recommended_route.distance_km.toFixed(1)} km</p>
            <p>Duration: {results.route.recommended_route.duration_min.toFixed(0)} minutes</p>
            <p>Crashes nearby: {results.route.recommended_route.crashes_nearby}</p>
            <p>Safety score: {results.route.recommended_route.safety_score.toFixed(3)}</p>
          </div>

          {/* Weather Results */}
          <div className="p-4 bg-green-100 rounded">
            <h3 className="font-bold text-lg">Current Weather</h3>
            <p>{results.weather.summary}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 4. Mapbox Integration

For route visualization:

```jsx
import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';

export default function RouteMap({ routeData }) {
  const mapContainer = useRef(null);
  const map = useRef(null);

  useEffect(() => {
    if (!routeData || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [routeData.recommended_route.coordinates[0][0], 
               routeData.recommended_route.coordinates[0][1]],
      zoom: 13
    });

    // Add route to map
    map.current.on('load', () => {
      map.current.addSource('route', {
        'type': 'geojson',
        'data': {
          'type': 'Feature',
          'properties': {},
          'geometry': routeData.recommended_route.geometry
        }
      });

      map.current.addLayer({
        'id': 'route',
        'type': 'line',
        'source': 'route',
        'layout': {
          'line-join': 'round',
          'line-cap': 'round'
        },
        'paint': {
          'line-color': '#3887be',
          'line-width': 5,
          'line-opacity': 0.75
        }
      });
    });
  }, [routeData]);

  return <div ref={mapContainer} className="w-full h-96" />;
}
```

---

## 📊 Response Formats

### Crash Analysis Response
```json
{
  "success": true,
  "location": {"lat": 37.2284, "lon": -80.4234},
  "radius_km": 2.0,
  "crash_summary": {
    "total_crashes": 5,
    "avg_distance_km": 1.2,
    "severity_breakdown": {"Minor": 3, "Major": 2},
    "total_casualties": 8
  },
  "weather": {
    "summary": "Clear sky, precipitation 0.0mm/h, wind 5.2 km/h, day"
  },
  "safety_analysis": "AI-generated safety report..."
}
```

### Safe Route Response
```json
{
  "success": true,
  "recommended_route": {
    "coordinates": [[lon, lat], [lon, lat], ...],
    "distance_km": 1.5,
    "duration_min": 4.2,
    "geometry": {...}, // GeoJSON for Mapbox
    "safety_score": 0.234,
    "crashes_nearby": 2
  },
  "safety_analysis": "AI-generated route safety report...",
  "weather_summary": "Current weather conditions...",
  "alternative_routes": [...]
}
```

---

## 🧪 Testing the API

Run the test script:
```bash
cd llm/api
python test_api.py
```

Or test individual endpoints with curl:
```bash
# Health check
curl http://localhost:5001/api/health

# Weather
curl "http://localhost:5001/api/weather?lat=37.2284&lon=-80.4234"

# Crash analysis
curl -X POST http://localhost:5001/api/analyze-crashes \
  -H "Content-Type: application/json" \
  -d '{"lat": 37.2284, "lon": -80.4234, "radius": 1.0}'
```

---

## 🎯 Next Steps

1. **Start Flask Server**: `cd llm && python api/flask_server.py`
2. **Test Endpoints**: Use the provided test scripts
3. **Integrate with Next.js**: Use the API client code above
4. **Add to Your Components**: Import and use the API functions
5. **Visualize Routes**: Use Mapbox with the route coordinates

Your Flask API is ready to bridge your Python AI/safety analysis with your Next.js frontend! 🚀