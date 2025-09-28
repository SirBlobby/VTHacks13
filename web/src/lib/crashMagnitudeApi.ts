/**
 * API service for crash magnitude prediction using AI model from ai.sirblob.co
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
 * Get crash magnitude prediction from AI model
 */
export async function getCrashMagnitudePrediction(
  sourceLat: number,
  sourceLon: number,
  destLat: number,
  destLon: number
): Promise<CrashMagnitudePrediction | null> {
  // Check circuit breaker first
  if (isCircuitBreakerOpen()) {
    console.log('⏸️ AI API circuit breaker is open, skipping API call');
    return null;
  }

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

    console.log('🔮 Requesting crash magnitude prediction:', requestBody);

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

    const response = await fetch('http://localhost:5001/predict', fetchOptions);

    if (!response.ok) {
      console.error('❌ Crash magnitude API error:', response.status, response.statusText);
      recordCircuitBreakerFailure();
      return null;
    }

    const data: CrashMagnitudeResponse = await response.json();
    console.log('✅ Crash magnitude prediction received:', data);
    
    // Record successful call
    recordCircuitBreakerSuccess();

    // Handle different response formats from the API
    if (data.prediction && typeof data.prediction === 'object' && data.prediction.prediction !== undefined) {
      // Response format: { prediction: { prediction: number } }
      return data.prediction;
    } else if (typeof data.prediction === 'number') {
      // Response format: { prediction: number }
      return { prediction: data.prediction };
    } else if (data.index !== undefined) {
      // If prediction is empty but we have an index, use index as fallback prediction
      console.log('🔄 Using index as fallback prediction:', data.index);
      return { prediction: data.index, confidence: 0.5 }; // Lower confidence for fallback
    }

    console.warn('⚠️ Unexpected response format from crash magnitude API:', data);
    return null;

  } catch (error) {
    recordCircuitBreakerFailure();
    
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
 * Circuit breaker to avoid repeated failed API calls
 */
let circuitBreakerFailures = 0;
let circuitBreakerLastFailTime = 0;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
const CIRCUIT_BREAKER_RESET_TIME = 300000; // 5 minutes

function isCircuitBreakerOpen(): boolean {
  const now = Date.now();
  
  // Reset circuit breaker after reset time
  if (now - circuitBreakerLastFailTime > CIRCUIT_BREAKER_RESET_TIME) {
    circuitBreakerFailures = 0;
    return false;
  }
  
  // Circuit is open if we have too many failures
  return circuitBreakerFailures >= CIRCUIT_BREAKER_THRESHOLD;
}

function recordCircuitBreakerFailure(): void {
  circuitBreakerFailures++;
  circuitBreakerLastFailTime = Date.now();
  
  if (circuitBreakerFailures === CIRCUIT_BREAKER_THRESHOLD) {
    console.warn(`🔌 AI API circuit breaker opened after ${CIRCUIT_BREAKER_THRESHOLD} failures. Will retry in ${CIRCUIT_BREAKER_RESET_TIME / 1000}s`);
  }
}

function recordCircuitBreakerSuccess(): void {
  if (circuitBreakerFailures > 0) {
    console.log('✅ AI API circuit breaker reset after successful request');
    circuitBreakerFailures = 0;
  }
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
 * Get current status of the AI API circuit breaker
 */
export function getCircuitBreakerStatus(): { isOpen: boolean; failures: number; resetTime?: number } {
  const isOpen = isCircuitBreakerOpen();
  return {
    isOpen,
    failures: circuitBreakerFailures,
    resetTime: isOpen ? circuitBreakerLastFailTime + CIRCUIT_BREAKER_RESET_TIME : undefined
  };
}