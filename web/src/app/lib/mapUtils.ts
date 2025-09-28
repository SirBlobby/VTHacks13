import { CrashData } from '../api/crashes/route';
import { getCachedCrashMagnitude, CrashMagnitudePrediction } from '../../lib/crashMagnitudeApi';

export type PointFeature = GeoJSON.Feature<GeoJSON.Point, { mag: number; crashData: CrashData; aiPredicted?: boolean }>;

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
        // Calculate fallback severity score based on fatalities and major injuries
        const fallbackSeverityScore = Math.max(1, 
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
                mag: Math.min(6, fallbackSeverityScore), // Cap at 6 for consistent visualization
                crashData: crash,
                aiPredicted: false // Will be updated when AI prediction is available
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

/**
 * Enhanced version that fetches AI predictions for crash magnitudes
 */
export const convertCrashDataToGeoJSONWithAI = async (crashes: CrashData[]): Promise<GeoJSON.FeatureCollection> => {
    console.log('🤖 Converting crash data to GeoJSON with AI predictions:', crashes.length, 'crashes');
    
    // Start with the basic conversion
    const baseGeoJSON = convertCrashDataToGeoJSON(crashes);
    
    // Limit concurrent API calls to avoid overwhelming the API
    const BATCH_SIZE = 10;
    const enhancedFeatures = [...baseGeoJSON.features];
    let successfulPredictions = 0;
    
    for (let i = 0; i < crashes.length; i += BATCH_SIZE) {
        const batch = crashes.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (crash, batchIndex) => {
            const featureIndex = i + batchIndex;
            
            try {
                // Get AI prediction for this crash location
                const prediction = await getCachedCrashMagnitude(crash.latitude, crash.longitude);
                
                if (prediction && typeof prediction.prediction === 'number') {
                    // Use AI prediction, but ensure it's in a reasonable range (1-10)
                    const aiMagnitude = Math.max(1, Math.min(10, Math.round(prediction.prediction)));
                    
                    enhancedFeatures[featureIndex] = {
                        ...enhancedFeatures[featureIndex],
                        properties: {
                            ...enhancedFeatures[featureIndex].properties,
                            mag: aiMagnitude,
                            aiPredicted: true
                        }
                    };
                    
                    return true; // Success
                }
            } catch (error) {
                console.warn(`⚠️ Failed to get AI prediction for crash ${featureIndex}:`, error);
            }
            
            return false; // Failed
        });
        
        const results = await Promise.allSettled(batchPromises);
        successfulPredictions += results.filter(r => r.status === 'fulfilled' && r.value === true).length;
        
        // Small delay between batches to be nice to the API
        if (i + BATCH_SIZE < crashes.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    const enhancedGeoJSON = {
        type: 'FeatureCollection' as const,
        features: enhancedFeatures as PointFeature[]
    };
    
    console.log(`✅ Enhanced GeoJSON with ${successfulPredictions}/${crashes.length} AI predictions`);
    
    return enhancedGeoJSON;
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
            properties: { mag, crashData: syntheticCrash, aiPredicted: false } 
        });
    }

    return { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection<GeoJSON.Geometry>;
};

/**
 * Enhanced version of generateDCPoints that uses AI predictions
 */
export const generateDCPointsWithAI = async (count = 500) => {
    const center = { lon: -77.0369, lat: 38.9072 };
    const features: PointFeature[] = [];

    const randNormal = () => {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };

    // Generate locations first
    const locations = [];
    for (let i = 0; i < count; i++) {
        const radius = Math.abs(randNormal()) * 0.02;
        const angle = Math.random() * Math.PI * 2;
        const lon = center.lon + Math.cos(angle) * radius;
        const lat = center.lat + Math.sin(angle) * radius;
        locations.push({ lon, lat, index: i });
    }

    // Get AI predictions in batches to avoid overwhelming the API
    console.log(`🤖 Getting AI predictions for ${count} synthetic points...`);
    const BATCH_SIZE = 20;
    const predictions: (any | null)[] = new Array(count).fill(null);
    let successfulPredictions = 0;

    for (let i = 0; i < locations.length; i += BATCH_SIZE) {
        const batch = locations.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (location) => {
            try {
                const prediction = await getCachedCrashMagnitude(location.lat, location.lon);
                return prediction;
            } catch (error) {
                console.warn(`⚠️ Failed to get AI prediction for synthetic point ${location.index}:`, error);
                return null;
            }
        });

        const batchResults = await Promise.allSettled(batchPromises);
        batchResults.forEach((result, batchIndex) => {
            const globalIndex = i + batchIndex;
            if (result.status === 'fulfilled') {
                predictions[globalIndex] = result.value;
                if (result.value) successfulPredictions++;
            }
        });

        // Small delay between batches
        if (i + BATCH_SIZE < locations.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    // Create features with AI predictions or fallback magnitudes
    for (let i = 0; i < count; i++) {
        const location = locations[i];
        const prediction = predictions[i];
        
        // Use AI prediction if available, otherwise use random magnitude
        let mag: number;
        let aiPredicted = false;
        
        if (prediction && typeof prediction.prediction === 'number') {
            mag = Math.max(1, Math.min(10, Math.round(prediction.prediction)));
            aiPredicted = true;
        } else {
            mag = Math.round(Math.max(1, Math.abs(randNormal()) * 6));
        }
        
        // Create synthetic crash data for backward compatibility
        const syntheticCrash: CrashData = {
            id: `synthetic-${i}`,
            latitude: location.lat,
            longitude: location.lon,
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
            geometry: { type: 'Point', coordinates: [location.lon, location.lat] }, 
            properties: { mag, crashData: syntheticCrash, aiPredicted } 
        });
    }

    console.log(`✅ Generated ${count} synthetic points with ${successfulPredictions} AI predictions`);

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
