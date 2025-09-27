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
