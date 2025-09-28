import { CrashData } from '../api/crashes/route';

export type PointFeature = GeoJSON.Feature<GeoJSON.Point, { mag: number; crashData: CrashData }>;

export const haversine = (a: [number, number], b: [number, number]) => {
    const toRad = (v: number) => v * Math.PI / 180;
    const R = 6371000; // meters
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const sinDLat = Math.sin(dLat/2);
    const sinDLon = Math.sin(dLon/2);
    const aH = sinDLat*sinDLat + sinDLon*sinDLon * Math.cos(lat1)*Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(aH), Math.sqrt(1-aH));
    return R * c;
};

export const convertCrashDataToGeoJSON = (crashes: CrashData[]): GeoJSON.FeatureCollection => {
    console.log('Converting crash data to GeoJSON:', crashes.length, 'crashes');
    console.log('Sample crash data:', crashes[0]);
    
    const features: PointFeature[] = crashes.map((crash) => {
        // Calculate severity score based on fatalities and major injuries
        const severityScore = Math.max(1, 
            (crash.fatalDriver + crash.fatalPedestrian + crash.fatalBicyclist) * 3 + 
            (crash.majorInjuriesDriver + crash.majorInjuriesPedestrian + crash.majorInjuriesBicyclist) * 2 +
            (crash.totalVehicles + crash.totalPedestrians + crash.totalBicycles)
        );

        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [crash.longitude, crash.latitude]
            },
            properties: {
                mag: Math.min(6, severityScore), // Cap at 6 for consistent visualization
                crashData: crash
            }
        };
    });

    const geoJSON = {
        type: 'FeatureCollection' as const,
        features
    };
    
    console.log('Generated GeoJSON with', features.length, 'features');
    console.log('Sample feature:', features[0]);
    
    return geoJSON;
};

export const generateDCPoints = (count = 500) => {
    const center = { lon: -77.0369, lat: 38.9072 };
    const features: PointFeature[] = [];

    const randNormal = () => {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };

    for (let i = 0; i < count; i++) {
        const radius = Math.abs(randNormal()) * 0.02;
        const angle = Math.random() * Math.PI * 2;
        const lon = center.lon + Math.cos(angle) * radius;
        const lat = center.lat + Math.sin(angle) * radius;
        const mag = Math.round(Math.max(1, Math.abs(randNormal()) * 6));
        
        // Create synthetic crash data for backward compatibility
        const syntheticCrash: CrashData = {
            id: `synthetic-${i}`,
            latitude: lat,
            longitude: lon,
            reportDate: new Date().toISOString(),
            address: `Synthetic Location ${i}`,
            ward: 'Ward 1',
            totalVehicles: Math.floor(Math.random() * 3) + 1,
            totalPedestrians: Math.floor(Math.random() * 2),
            totalBicycles: Math.floor(Math.random() * 2),
            fatalDriver: 0,
            fatalPedestrian: 0,
            fatalBicyclist: 0,
            majorInjuriesDriver: Math.floor(Math.random() * 2),
            majorInjuriesPedestrian: 0,
            majorInjuriesBicyclist: 0,
            speedingInvolved: Math.floor(Math.random() * 2),
        };
        
        features.push({ 
            type: 'Feature', 
            geometry: { type: 'Point', coordinates: [lon, lat] }, 
            properties: { mag, crashData: syntheticCrash } 
        });
    }

    return { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection<GeoJSON.Geometry>;
};

// Calculate crash density along a route path
export const calculateRouteCrashDensity = (
    routeCoordinates: [number, number][],
    crashData: CrashData[],
    searchRadiusMeters: number = 100
): number[] => {
    if (!routeCoordinates || routeCoordinates.length === 0) return [];
    
    const densities: number[] = [];
    
    for (let i = 0; i < routeCoordinates.length; i++) {
        const currentPoint = routeCoordinates[i];
        let crashCount = 0;
        let severityScore = 0;
        
        // Count crashes within search radius of current point
        for (const crash of crashData) {
            const crashPoint: [number, number] = [crash.longitude, crash.latitude];
            const distance = haversine(currentPoint, crashPoint);
            
            if (distance <= searchRadiusMeters) {
                crashCount++;
                // Weight by severity
                const severity = Math.max(1, 
                    (crash.fatalDriver + crash.fatalPedestrian + crash.fatalBicyclist) * 5 +
                    (crash.majorInjuriesDriver + crash.majorInjuriesPedestrian + crash.majorInjuriesBicyclist) * 3 +
                    (crash.totalVehicles + crash.totalPedestrians + crash.totalBicycles)
                );
                severityScore += severity;
            }
        }
        
        // Normalize density score (0-1 range)
        const density = Math.min(1, severityScore / 20); // Adjust divisor based on data
        densities.push(density);
    }
    
    return densities;
};

// Create gradient stops based on crash densities along route
export const createRouteGradientStops = (densities: number[]): any[] => {
    if (!densities || densities.length === 0) {
        // Default gradient: green to red
        return [
            'interpolate',
            ['linear'],
            ['line-progress'],
            0, 'green',
            1, 'red'
        ];
    }
    
    const stops: any[] = ['interpolate', ['linear'], ['line-progress']];
    
    for (let i = 0; i < densities.length; i++) {
        const progress = i / (densities.length - 1);
        const density = densities[i];
        
        // Color based on crash density: green (safe) to red (dangerous)
        let color: string;
        if (density < 0.2) {
            color = '#22c55e'; // green
        } else if (density < 0.4) {
            color = '#eab308'; // yellow
        } else if (density < 0.6) {
            color = '#f97316'; // orange
        } else if (density < 0.8) {
            color = '#dc2626'; // red
        } else {
            color = '#7f1d1d'; // dark red
        }
        
        stops.push(progress, color);
    }
    
    return stops;
};
