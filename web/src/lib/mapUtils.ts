import { CrashData } from '../app/api/crashes/route';

export type PointFeature = GeoJSON.Feature<GeoJSON.Point, { 
  mag: number; 
  crashData?: CrashData;
  aiPredicted?: boolean;
}>;

/**
 * Calculate traditional magnitude based on crash severity factors
 */
export const calculateTraditionalMagnitude = (crash: CrashData): number => {
  let magnitude = 0;

  // Fatalities contribute heavily (3 points each)
  const fatalities = (crash.fatalDriver || 0) + (crash.fatalPedestrian || 0) + (crash.fatalBicyclist || 0);
  magnitude += fatalities * 3;

  // Major injuries contribute significantly (2 points each)
  const majorInjuries = (crash.majorInjuriesDriver || 0) + (crash.majorInjuriesPedestrian || 0) + (crash.majorInjuriesBicyclist || 0);
  magnitude += majorInjuries * 2;

  // Vehicle involvement (diminishing returns after first vehicle)
  const vehicleCount = (crash.totalVehicles || 0) + (crash.totalPedestrians || 0) + (crash.totalBicycles || 0);
  magnitude += Math.min(vehicleCount - 1, 3) * 0.5; // Cap vehicle contribution

  // Speeding factor
  if (crash.speedingInvolved && crash.speedingInvolved > 0) {
    magnitude *= 1.2;
  }

  // Ensure minimum severity of 1, maximum of 10
  return Math.max(1, Math.min(magnitude, 10));
};

/**
 * Convert crash data to GeoJSON format with traditional calculations
 */
export const convertCrashDataToGeoJSON = (crashes: CrashData[]): GeoJSON.FeatureCollection => {
  const features: PointFeature[] = crashes
    .filter(crash => 
      crash && 
      typeof crash.latitude === 'number' && 
      typeof crash.longitude === 'number' &&
      !isNaN(crash.latitude) && !isNaN(crash.longitude) &&
      crash.latitude !== 0 && crash.longitude !== 0
    )
    .map(crash => {
      const magnitude = calculateTraditionalMagnitude(crash);
      
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [crash.longitude, crash.latitude]
        },
        properties: {
          mag: Math.min(6, magnitude), // Cap at 6 for consistent visualization
          crashData: crash,
          aiPredicted: false
        }
      };
    });

  const geoJSON: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection' as const,
    features
  };

  return geoJSON;
};

/**
 * Haversine formula to calculate distance between two coordinates
 */
export const haversine = (a: [number, number], b: [number, number]): number => {
  const toRad = (v: number) => v * Math.PI / 180;
  const R = 6371000; // meters
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const sinDLat = Math.sin(dLat/2);
  const sinDLon = Math.sin(dLon/2);
  const a_calc = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(a_calc), Math.sqrt(1 - a_calc));
  return R * c;
};

/**
 * Generate synthetic crash data for testing/demo purposes
 */
export const createSyntheticCrashData = (
  centerLat: number,
  centerLng: number,
  count: number,
  radiusKm = 10
): CrashData[] => {
  const crashes: CrashData[] = [];
  
  for (let i = 0; i < count; i++) {
    // Random point within radius
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.sqrt(Math.random()) * radiusKm / 111; // Rough conversion to degrees
    
    const lat = centerLat + distance * Math.cos(angle);
    const lng = centerLng + distance * Math.sin(angle);
    
    // Random severity factors
    const hasInjuries = Math.random() < 0.3;
    const hasFatalities = Math.random() < 0.05;
    
    const crash: CrashData = {
      id: `synthetic-${i + 1}`,
      reportDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
      latitude: lat,
      longitude: lng,
      address: `Sample Address ${i + 1}`,
      ward: `Ward ${Math.floor(Math.random() * 8) + 1}`,
      totalVehicles: Math.floor(Math.random() * 3) + 1,
      totalPedestrians: Math.random() < 0.2 ? 1 : 0,
      totalBicycles: Math.random() < 0.1 ? 1 : 0,
      fatalDriver: hasFatalities ? Math.floor(Math.random() * 2) : 0,
      fatalPedestrian: hasFatalities && Math.random() < 0.3 ? 1 : 0,
      fatalBicyclist: hasFatalities && Math.random() < 0.1 ? 1 : 0,
      majorInjuriesDriver: hasInjuries ? Math.floor(Math.random() * 2) : 0,
      majorInjuriesPedestrian: hasInjuries && Math.random() < 0.3 ? 1 : 0,
      majorInjuriesBicyclist: hasInjuries && Math.random() < 0.1 ? 1 : 0,
      speedingInvolved: Math.random() < 0.25 ? 1 : 0
    };
    
    crashes.push(crash);
  }
  
  return crashes;
};

/**
 * Convert synthetic crash data to GeoJSON format
 */
export const convertSyntheticDataToGeoJSON = (
  centerLat: number,
  centerLng: number,
  count: number
): GeoJSON.FeatureCollection => {
  const syntheticCrashes = createSyntheticCrashData(centerLat, centerLng, count);
  return convertCrashDataToGeoJSON(syntheticCrashes);
};

/**
 * Calculate crash density for route analysis
 */
export const calculateRouteDensity = (
  routeCoordinates: [number, number][],
  crashes: CrashData[],
  bufferMeters = 100
): number => {
  let totalCrashes = 0;
  const routeLength = routeCoordinates.length;
  
  for (let i = 0; i < routeLength - 1; i++) {
    const segmentStart = routeCoordinates[i];
    const segmentEnd = routeCoordinates[i + 1];
    
    // Count crashes near this segment
    const segmentCrashes = crashes.filter(crash => {
      const crashPoint: [number, number] = [crash.longitude, crash.latitude];
      const distanceToSegment = Math.min(
        haversine(crashPoint, segmentStart),
        haversine(crashPoint, segmentEnd)
      );
      return distanceToSegment <= bufferMeters;
    });
    
    totalCrashes += segmentCrashes.length;
  }
  
  return totalCrashes / Math.max(1, routeLength);
};