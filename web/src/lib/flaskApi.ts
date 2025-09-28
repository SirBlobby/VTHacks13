const FLASK_API_BASE = 'http://127.0.0.1:5001';

export interface WeatherData {
  temperature: number;
  description: string;
  humidity: number;
  windSpeed: number;
  precipitation?: number;
  visibility?: number;
  summary?: string;
  timeOfDay?: string;
}

export interface CrashAnalysisData {
  riskLevel: string;
  crashSummary?: {
    totalCrashes: number;
    totalCasualties: number;
    severityBreakdown: Record<string, number>;
  };
  recommendations: string[];
  safetyAnalysis?: string;
}

export const fetchWeatherData = async (lat: number, lng: number): Promise<WeatherData> => {
  const response = await fetch(`${FLASK_API_BASE}/api/weather?lat=${lat}&lon=${lng}`);
  
  if (!response.ok) {
    throw new Error('Failed to fetch weather data');
  }

  const data = await response.json();
  return transformWeatherData(data);
};

export const fetchCrashAnalysis = async (lat: number, lng: number): Promise<CrashAnalysisData> => {
  const response = await fetch(`${FLASK_API_BASE}/api/analyze-crashes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ lat, lon: lng }),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch crash analysis');
  }

  const data = await response.json();
  return transformCrashAnalysis(data);
};

// Transform Flask weather API response to our WeatherData interface
const transformWeatherData = (apiResponse: any): WeatherData => {
  // Extract summary if available
  let summary = '';
  let timeOfDay = '';
  
  if (apiResponse.summary) {
    summary = apiResponse.summary;
    // Extract time of day from summary
    if (summary.includes('Time: ')) {
      const timeMatch = summary.match(/Time: (\w+)/);
      if (timeMatch) {
        timeOfDay = timeMatch[1];
      }
    }
  }

  // Extract data from weather_data.current if available
  const current = apiResponse.weather_data?.current;
  
  return {
    temperature: current?.temperature_2m || apiResponse.temperature || 0,
    description: current?.weather_description || apiResponse.description || (summary.includes('Conditions: ') ? summary.split('Conditions: ')[1]?.split(' |')[0] || 'N/A' : 'N/A'),
    humidity: current?.relative_humidity_2m || apiResponse.humidity || 0,
    windSpeed: current?.wind_speed_10m || apiResponse.windSpeed || 0,
    precipitation: current?.precipitation || apiResponse.precipitation || 0,
    visibility: current?.visibility || apiResponse.visibility,
    summary: summary,
    timeOfDay: timeOfDay || (current?.is_day === 0 ? 'night' : current?.is_day === 1 ? 'day' : '')
  };
};

// Transform Flask crash analysis API response to our CrashAnalysisData interface
const transformCrashAnalysis = (apiResponse: any): CrashAnalysisData => {
  const data = apiResponse;
  
  // Extract risk level from safety analysis text
  let riskLevel = 'unknown';
  let recommendations: string[] = [];
  
  if (data.safety_analysis) {
    const safetyText = data.safety_analysis;
    const safetyTextLower = safetyText.toLowerCase();
    
    // Look for danger level assessment (now without markdown formatting)
    const dangerLevelMatch = safetyText.match(/danger level assessment[:\s]*([^.\n]+)/i);
    if (dangerLevelMatch) {
      const level = dangerLevelMatch[1].trim().toLowerCase();
      if (level.includes('very high') || level.includes('extreme')) {
        riskLevel = 'high';
      } else if (level.includes('high')) {
        riskLevel = 'high';
      } else if (level.includes('moderate') || level.includes('medium')) {
        riskLevel = 'medium';
      } else if (level.includes('low')) {
        riskLevel = 'low';
      }
    } else {
      // Fallback to searching for risk indicators in the text
      if (safetyTextLower.includes('very high') || safetyTextLower.includes('extremely dangerous')) {
        riskLevel = 'high';
      } else if (safetyTextLower.includes('high risk') || safetyTextLower.includes('very dangerous')) {
        riskLevel = 'high';
      } else if (safetyTextLower.includes('moderate risk') || safetyTextLower.includes('medium risk')) {
        riskLevel = 'medium';
      } else if (safetyTextLower.includes('low risk') || safetyTextLower.includes('relatively safe')) {
        riskLevel = 'low';
      }
    }
    
    // Extract recommendations from safety analysis (now without markdown)
    const recommendationsMatch = safetyText.match(/specific recommendations[^:]*:([\s\S]*?)(?=\n\n|\d+\.|$)/i);
    if (recommendationsMatch) {
      const recommendationsText = recommendationsMatch[1];
      // Split by lines and filter for meaningful recommendations
      const lines = recommendationsText.split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 20 && !line.match(/^\d+\./))
        .slice(0, 4);
      recommendations = lines;
    }
    
    // If no specific recommendations section found, try to extract key sentences
    if (recommendations.length === 0) {
      const sentences = safetyText.split(/[.!?]/)
        .map((sentence: string) => sentence.trim())
        .filter((sentence: string) => 
          sentence.length > 30 && 
          (sentence.toLowerCase().includes('recommend') || 
           sentence.toLowerCase().includes('should') ||
           sentence.toLowerCase().includes('consider') ||
           sentence.toLowerCase().includes('avoid'))
        )
        .slice(0, 3);
      recommendations = sentences.map((s: string) => s + (s.endsWith('.') ? '' : '.'));
    }
  }
  
  return {
    riskLevel: riskLevel,
    crashSummary: data.crash_summary ? {
      totalCrashes: data.crash_summary.total_crashes || 0,
      totalCasualties: data.crash_summary.total_casualties || 0,
      severityBreakdown: data.crash_summary.severity_breakdown || {}
    } : undefined,
    recommendations: recommendations.slice(0, 5), // Limit to 5 recommendations
    safetyAnalysis: data.safety_analysis || ''
  };
};