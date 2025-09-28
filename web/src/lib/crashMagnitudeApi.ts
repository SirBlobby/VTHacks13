/**
 * API service for crash magnitude prediction using roadcast model
 */

export interface CrashMagnitudePrediction {
  prediction: number;
  confidence?: number;
}

export interface CrashMagnitudeRequest {
  source: {
    lat: number;
    lon: number;
  };
  destination: {
    lat: number;
    lon: number;
  };
}

export interface CrashMagnitudeResponse {
  prediction: CrashMagnitudePrediction;
  called_with: string;
  diagnostics?: {
    input_dim: number;
  };
  index?: number;
}

/**
 * Get crash magnitude prediction from roadcast API
 * Simplified version that always tries to get the prediction
 */
export async function getCrashMagnitudePrediction(
  sourceLat: number,
  sourceLon: number,
  destLat: number,
  destLon: number
): Promise<CrashMagnitudePrediction | null> {

  try {
    const requestBody: CrashMagnitudeRequest = {
      source: {
        lat: sourceLat,
        lon: sourceLon
      },
      destination: {
        lat: destLat,
        lon: destLon
      }
    };

    console.log('� Requesting crash magnitude from roadcast API:', requestBody);

    // Create fetch options with timeout
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    };

    // Add timeout if AbortSignal.timeout is supported
    try {
      if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
        fetchOptions.signal = AbortSignal.timeout(10000); // 10 second timeout
      }
    } catch (e) {
      // AbortSignal.timeout not supported, continue without timeout
      console.log('⚠️ AbortSignal.timeout not supported, continuing without timeout');
    }

    const response = await fetch('http://localhost:5000/predict', fetchOptions);

    if (!response.ok) {
      console.error('❌ Roadcast API error:', response.status, response.statusText);
      return null;
    }

    const data: CrashMagnitudeResponse = await response.json();
    console.log('✅ Roadcast magnitude prediction received:', data);
    
    // Handle roadcast API response format
    // The roadcast API returns the magnitude in the 'index' field
    if (data.index !== undefined) {
      console.log('🎯 Using roadcast index as crash magnitude:', data.index);
      return { 
        prediction: data.index, 
        confidence: 0.95 // High confidence for roadcast model
      };
    } else if (data.prediction && typeof data.prediction === 'object' && data.prediction.prediction !== undefined) {
      // Fallback: Response format: { prediction: { prediction: number } }
      return data.prediction;
    } else if (typeof data.prediction === 'number') {
      // Fallback: Response format: { prediction: number }
      return { prediction: data.prediction };
    }

    console.warn('⚠️ No usable magnitude data in roadcast API response:', data);
    return null;

  } catch (error) {
    
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.warn('⏰ Crash magnitude API request timed out');
      } else if (error.message.includes('fetch')) {
        console.warn('🌐 Network error accessing crash magnitude API:', error.message);
      } else {
        console.warn('❌ Error fetching crash magnitude prediction:', error.message);
      }
    } else {
      console.warn('❌ Unknown error fetching crash magnitude prediction:', error);
    }
    return null;
  }
}

/**
 * Get crash magnitude for a single point (using same point for source and destination)
 */
export async function getPointCrashMagnitude(
  lat: number,
  lon: number
): Promise<CrashMagnitudePrediction | null> {
  return getCrashMagnitudePrediction(lat, lon, lat, lon);
}

/**
 * Batch get crash magnitude predictions for multiple locations
 */
export async function getBatchCrashMagnitudes(
  locations: Array<{ lat: number; lon: number; id?: string }>
): Promise<Array<{ prediction: CrashMagnitudePrediction | null; id?: string }>> {
  const results = await Promise.allSettled(
    locations.map(async (location) => {
      const prediction = await getPointCrashMagnitude(location.lat, location.lon);
      return { prediction, id: location.id };
    })
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      console.error(`❌ Failed to get magnitude for location ${index}:`, result.reason);
      return { prediction: null, id: locations[index].id };
    }
  });
}

/**
 * Cache for magnitude predictions to avoid repeated API calls
 */
const magnitudeCache = new Map<string, { prediction: CrashMagnitudePrediction; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Status tracking for roadcast API (simplified - always available)
 */

function isCircuitBreakerOpen(): boolean {
  // Roadcast API is local and reliable, always return false
  return false;
}

function recordCircuitBreakerFailure(): void {
  // Not needed for local roadcast API, but kept for compatibility
}

function recordCircuitBreakerSuccess(): void {
  // Not needed for local roadcast API, but kept for compatibility
}

function getCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/**
 * Get cached crash magnitude or fetch if not available/expired
 */
export async function getCachedCrashMagnitude(
  lat: number,
  lon: number
): Promise<CrashMagnitudePrediction | null> {
  const cacheKey = getCacheKey(lat, lon);
  const cached = magnitudeCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('📦 Using cached magnitude prediction for:', cacheKey);
    return cached.prediction;
  }

  const prediction = await getPointCrashMagnitude(lat, lon);
  
  if (prediction) {
    magnitudeCache.set(cacheKey, {
      prediction,
      timestamp: Date.now()
    });
  }

  return prediction;
}

/**
 * Get current status of the roadcast API by testing connection
 */
export async function getCircuitBreakerStatus(): Promise<{ isOpen: boolean; failures: number; resetTime?: number }> {
  try {
    // Test the roadcast API with a simple request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
    
    const response = await fetch('http://localhost:5000/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: { lat: 38.9, lon: -77.0 },
        destination: { lat: 38.91, lon: -77.01 }
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      console.log('🟢 Roadcast API status check successful:', data.index);
      return {
        isOpen: false,  // API is available
        failures: 0,
        resetTime: undefined
      };
    } else {
      console.log('🔴 Roadcast API status check failed:', response.status);
      return {
        isOpen: true,   // API returned error
        failures: 1,
        resetTime: undefined
      };
    }
  } catch (error) {
    console.log('🔌 Roadcast API unavailable:', error);
    return {
      isOpen: true,   // API is unavailable
      failures: 1,
      resetTime: undefined
    };
  }
}