import os
import requests
import json
from datetime import datetime
from pymongo import MongoClient
from langchain_google_genai import ChatGoogleGenerativeAI
from math import radians, sin, cos, sqrt, atan2, degrees, atan2
from typing import List, Tuple, Dict, Optional




# Configuration
GEMINI_API_KEY = "AIzaSyBCbEOo4aK72507hqvpYkE9zXUe-z5aSXA"
OPENWEATHER_API_KEY = "8754b3f387fc0f1d96a81f73e303e181"
MONGO_URI = "mongodb+srv://Admin:HelloKitty420@geobase.tyxsoir.mongodb.net/crashes"
MAPBOX_API_KEY = "pk.eyJ1IjoicGllbG9yZDc1NyIsImEiOiJjbWcxdTd6c3AwMXU1MmtxMDh6b2l5amVrIn0.5Es0azrah23GX1e9tmbjGw"

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", api_key=GEMINI_API_KEY)

class SafeRouteAnalyzer:
    def __init__(self, mongo_uri: str):
        """Initialize the safe route analyzer with MongoDB connection."""
        try:
            self.client = MongoClient(mongo_uri)
            self.client.admin.command('ping')
            self.db = self.client.crashes
            self.collection = self.db.crashes
            print("✅ Connected to MongoDB for route safety analysis")
        except Exception as e:
            print(f"❌ Failed to connect to MongoDB: {e}")
            self.collection = None

    def haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points in kilometers."""
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        return 6371 * c  # Earth's radius in km

    def get_route_from_mapbox(self, start_lat: float, start_lon: float, 
                             end_lat: float, end_lon: float, profile: str = "driving") -> Dict:
        """
        Get route from Mapbox Directions API.
        
        Args:
            start_lat, start_lon: Starting coordinates
            end_lat, end_lon: Destination coordinates  
            profile: 'driving', 'walking', or 'cycling'
        
        Returns:
            Route data with coordinates, distance, duration
        """
        try:
            url = f"https://api.mapbox.com/directions/v5/mapbox/{profile}/{start_lon},{start_lat};{end_lon},{end_lat}"
            params = {
                'access_token': MAPBOX_API_KEY,
                'overview': 'full',
                'geometries': 'geojson',
                'steps': 'true'
            }
            
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            
            data = response.json()
            
            if data.get('code') == 'Ok' and data.get('routes'):
                route = data['routes'][0]
                geometry = route['geometry']
                
                # Extract coordinates from GeoJSON format
                coordinates = [[coord[1], coord[0]] for coord in geometry['coordinates']]  # Convert [lon,lat] to [lat,lon]
                
                return {
                    'success': True,
                    'coordinates': coordinates,  # List of [lat, lon] pairs
                    'distance_km': route['distance'] / 1000,
                    'duration_min': route['duration'] / 60,
                    'geometry': geometry
                }
            else:
                error_msg = data.get('message', 'No route found')
                return {'success': False, 'error': error_msg}
                
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def get_alternative_routes_mapbox(self, start_lat: float, start_lon: float,
                                     end_lat: float, end_lon: float, num_alternatives: int = 3) -> List[Dict]:
        """
        Get multiple alternative routes using Mapbox Directions API.
        """
        try:
            url = f"https://api.mapbox.com/directions/v5/mapbox/driving/{start_lon},{start_lat};{end_lon},{end_lat}"
            params = {
                'access_token': MAPBOX_API_KEY,
                'alternatives': 'true',  # Request alternatives
                'overview': 'full',
                'geometries': 'geojson',
                'steps': 'false'
            }
            
            response = requests.get(url, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
            
            routes = []
            if data.get('code') == 'Ok' and data.get('routes'):
                for i, route in enumerate(data['routes'][:num_alternatives]):
                    geometry = route['geometry']
                    coordinates = [[coord[1], coord[0]] for coord in geometry['coordinates']]  # Convert [lon,lat] to [lat,lon]
                    
                    routes.append({
                        'route_id': i,
                        'coordinates': coordinates,
                        'distance_km': route['distance'] / 1000,
                        'duration_min': route['duration'] / 60,
                        'geometry': geometry
                    })
            
            return routes
            
        except Exception as e:
            print(f"Error getting alternative routes: {e}")
            return []

    def analyze_route_safety(self, route_coordinates: List[Tuple[float, float]], 
                           buffer_km: float = 0.2) -> Dict:
        """
        Analyze safety along a route by checking for crashes near route points.
        
        Args:
            route_coordinates: List of (lat, lon) tuples along the route
            buffer_km: How far to look for crashes around each route point
            
        Returns:
            Safety analysis data
        """
        if self.collection is None:
            return {'error': 'No database connection'}
            
        try:
            all_nearby_crashes = []
            safety_scores = []
            
            # Sample every Nth point to avoid too many queries (adjust based on route length)
            sample_interval = max(1, len(route_coordinates) // 20)  # Max 20 sample points
            sample_points = route_coordinates[::sample_interval]
            
            print(f"🔍 Analyzing safety at {len(sample_points)} points along route...")
            
            for i, (lat, lon) in enumerate(sample_points):
                # Query crashes within buffer distance of this route point
                radius_radians = buffer_km / 6371
                
                query = {
                    "location": {
                        "$geoWithin": {
                            "$centerSphere": [[lon, lat], radius_radians]
                        }
                    },
                    "reportDate": {
                        "$gte": datetime(2020, 1, 1)
                    }
                }
                
                crashes_near_point = list(self.collection.find(query))
                
                # Calculate safety score for this point (lower = safer)
                point_safety_score = self.calculate_point_safety_score(crashes_near_point)
                safety_scores.append({
                    'point_index': i * sample_interval,
                    'coordinates': [lat, lon],
                    'crashes_count': len(crashes_near_point),
                    'safety_score': point_safety_score
                })
                
                all_nearby_crashes.extend(crashes_near_point)
            
            # Remove duplicate crashes
            unique_crashes = {}
            for crash in all_nearby_crashes:
                crash_id = crash.get('crashId', str(crash.get('_id')))
                if crash_id not in unique_crashes:
                    unique_crashes[crash_id] = crash
            
            unique_crashes_list = list(unique_crashes.values())
            
            # Calculate overall route safety metrics
            total_crashes = len(unique_crashes_list)
            avg_safety_score = sum(point['safety_score'] for point in safety_scores) / len(safety_scores) if safety_scores else 0
            max_danger_score = max((point['safety_score'] for point in safety_scores), default=0)
            
            return {
                'total_crashes_near_route': total_crashes,
                'average_safety_score': avg_safety_score,
                'max_danger_score': max_danger_score,
                'safety_points': safety_scores,
                'crashes_data': unique_crashes_list,
                'route_length_points': len(route_coordinates)
            }
            
        except Exception as e:
            return {'error': str(e)}

    def calculate_point_safety_score(self, crashes: List[Dict]) -> float:
        """
        Calculate a safety score for a point based on nearby crashes.
        Higher score = more dangerous
        """
        if not crashes:
            return 0.0
            
        score = 0.0
        
        for crash in crashes:
            # Base score for any crash
            base_score = 1.0
            
            # Weight by severity
            severity = crash.get('severity', '').lower()
            if 'fatal' in severity or 'major' in severity:
                base_score *= 3.0
            elif 'minor' in severity:
                base_score *= 1.5
            
            # Weight by casualty count
            casualties = crash.get('casualties', {})
            total_casualties = 0
            for category in ['bicyclists', 'drivers', 'pedestrians', 'passengers']:
                if category in casualties:
                    cat_data = casualties[category]
                    total_casualties += (cat_data.get('fatal', 0) * 5 +
                                       cat_data.get('major_injuries', 0) * 2 +
                                       cat_data.get('minor_injuries', 0) * 1)
            
            base_score += total_casualties * 0.5
            
            # Weight by circumstances
            circumstances = crash.get('circumstances', {})
            if circumstances.get('speeding_involved', False):
                base_score *= 1.3
            if any([circumstances.get('pedestrians_impaired', False),
                   circumstances.get('bicyclists_impaired', False), 
                   circumstances.get('drivers_impaired', False)]):
                base_score *= 1.4
                
            score += base_score
        
        return score

    def generate_safety_report_with_llm(self, route_safety_data: Dict, 
                                       route_info: Dict, weather_summary: str = None) -> str:
        """
        Use LLM to generate comprehensive safety report and route recommendations.
        """
        if 'error' in route_safety_data:
            return f"Error analyzing route safety: {route_safety_data['error']}"
            
        crashes = route_safety_data.get('crashes_data', [])
        safety_points = route_safety_data.get('safety_points', [])
        
        # Find most dangerous sections
        dangerous_points = sorted(safety_points, key=lambda x: x['safety_score'], reverse=True)[:3]
        
        # Analyze crash patterns
        severity_counts = {}
        casualty_summary = {'fatal': 0, 'major': 0, 'minor': 0}
        risk_factors = {'speeding': 0, 'impairment': 0, 'pedestrian': 0, 'bicyclist': 0}
        
        for crash in crashes:
            severity = crash.get('severity', 'Unknown')
            severity_counts[severity] = severity_counts.get(severity, 0) + 1
            
            # Count casualties
            casualties = crash.get('casualties', {})
            for category in ['bicyclists', 'drivers', 'pedestrians', 'passengers']:
                if category in casualties:
                    cat_data = casualties[category]
                    casualty_summary['fatal'] += cat_data.get('fatal', 0)
                    casualty_summary['major'] += cat_data.get('major_injuries', 0)
                    casualty_summary['minor'] += cat_data.get('minor_injuries', 0)
            
            # Count risk factors
            circumstances = crash.get('circumstances', {})
            if circumstances.get('speeding_involved', False):
                risk_factors['speeding'] += 1
            if any([circumstances.get(f'{cat}_impaired', False) for cat in ['pedestrians', 'bicyclists', 'drivers']]):
                risk_factors['impairment'] += 1
            if casualties.get('pedestrians', {}).get('total', 0) > 0:
                risk_factors['pedestrian'] += 1
            if casualties.get('bicyclists', {}).get('total', 0) > 0:
                risk_factors['bicyclist'] += 1
        
        weather_info = f"\n\nCURRENT WEATHER CONDITIONS:\n{weather_summary}" if weather_summary else ""
        
        prompt = f"""You are an expert traffic safety analyst and route planning specialist. Analyze this route's safety profile and provide recommendations.

ROUTE INFORMATION:
- Distance: {route_info.get('distance_km', 0):.1f} km
- Estimated duration: {route_info.get('duration_min', 0):.0f} minutes
- Analysis points along route: {len(safety_points)}

SAFETY ANALYSIS (2020+ crash data):
- Total crashes near route: {route_safety_data.get('total_crashes_near_route', 0)}
- Average safety score: {route_safety_data.get('average_safety_score', 0):.2f}
- Maximum danger score: {route_safety_data.get('max_danger_score', 0):.2f}

CRASH BREAKDOWN:
- Severity distribution: {severity_counts}
- Casualties: {casualty_summary['fatal']} fatal, {casualty_summary['major']} major injuries, {casualty_summary['minor']} minor injuries
- Risk factors: {risk_factors['speeding']} speeding-related, {risk_factors['impairment']} impairment-related
- Vulnerable users: {risk_factors['pedestrian']} pedestrian crashes, {risk_factors['bicyclist']} bicyclist crashes

MOST DANGEROUS SECTIONS:
{chr(10).join([f"Point {p['point_index']}: {p['crashes_count']} crashes nearby, safety score {p['safety_score']:.1f}" for p in dangerous_points[:3]])}
{weather_info}

Please provide:
1. Overall route safety assessment (SAFE/MODERATE RISK/HIGH RISK/DANGEROUS)
2. Specific dangerous sections to watch out for
3. Driving recommendations for this route considering current conditions
4. Whether an alternative route should be recommended
5. Time-of-day considerations if applicable
6. Weather-specific precautions based on crash patterns

Be specific and actionable in your recommendations."""

        try:
            response = llm.invoke(prompt)
            return response.content
        except Exception as e:
            return f"Error generating safety analysis: {e}"

    def find_safer_route(self, start_lat: float, start_lon: float,
                        end_lat: float, end_lon: float) -> Dict:
        """
        Find the safest route among alternatives by analyzing crash data.
        """
        print("🗺️  Getting alternative routes...")
        
        # Get multiple route options
        alternative_routes = self.get_alternative_routes_mapbox(start_lat, start_lon, end_lat, end_lon)
        
        if not alternative_routes:
            print("❌ No routes found")
            return {'error': 'No routes available'}
        
        print(f"📍 Analyzing {len(alternative_routes)} route options for safety...")
        
        # Analyze safety for each route
        route_analyses = []
        for i, route in enumerate(alternative_routes):
            print(f"🔍 Analyzing route {i+1}/{len(alternative_routes)}...")
            
            safety_analysis = self.analyze_route_safety(route['coordinates'])
            
            if 'error' not in safety_analysis:
                route_analyses.append({
                    'route_id': i,
                    'route_data': route,
                    'safety_analysis': safety_analysis,
                    'safety_score': safety_analysis.get('average_safety_score', float('inf'))
                })
        
        if not route_analyses:
            return {'error': 'Could not analyze any routes for safety'}
        
        # Sort routes by safety (lower score = safer)
        route_analyses.sort(key=lambda x: x['safety_score'])
        
        # Get weather for additional context
        weather_data, weather_summary = self.get_current_weather(start_lat, start_lon)
        
        # Generate safety reports for top routes
        results = {
            'recommended_route': route_analyses[0],
            'alternative_routes': route_analyses[1:],
            'weather_summary': weather_summary
        }
        
        # Generate LLM analysis for the safest route
        safest_route = route_analyses[0]
        safety_report = self.generate_safety_report_with_llm(
            safest_route['safety_analysis'], 
            safest_route['route_data'],
            weather_summary
        )
        
        results['safety_report'] = safety_report
        results['route_comparison'] = self.compare_routes_with_llm(route_analyses, weather_summary)
        
        return results

    def compare_routes_with_llm(self, route_analyses: List[Dict], weather_summary: str = None) -> str:
        """
        Use LLM to compare multiple routes and explain why one is safer.
        """
        if len(route_analyses) < 2:
            return "Only one route available for analysis."
        
        comparison_data = []
        for i, analysis in enumerate(route_analyses):
            route_data = analysis['route_data']
            safety_data = analysis['safety_analysis']
            
            comparison_data.append({
                'route_num': i + 1,
                'distance_km': route_data.get('distance_km', 0),
                'duration_min': route_data.get('duration_min', 0),
                'crashes_near_route': safety_data.get('total_crashes_near_route', 0),
                'safety_score': safety_data.get('average_safety_score', 0),
                'max_danger_score': safety_data.get('max_danger_score', 0)
            })
        
        weather_info = f"\nCurrent weather: {weather_summary}" if weather_summary else ""
        
        prompt = f"""Compare these route options for safety and provide a recommendation:

ROUTE OPTIONS:
{chr(10).join([f"Route {r['route_num']}: {r['distance_km']:.1f}km, {r['duration_min']:.0f}min, {r['crashes_near_route']} nearby crashes, safety score {r['safety_score']:.2f}" for r in comparison_data])}{weather_info}

Provide:
1. Which route is safest and why
2. Trade-offs between routes (safety vs. time/distance)
3. Clear recommendation with reasoning
4. Any weather-related considerations

Keep it concise and actionable."""

        try:
            response = llm.invoke(prompt)
            return response.content
        except Exception as e:
            return f"Error comparing routes: {e}"

    def get_current_weather(self, lat: float, lon: float) -> Tuple[Optional[Dict], str]:
        """Get current weather conditions."""
        try:
            url = "https://api.openweathermap.org/data/2.5/weather"
            response = requests.get(
                url,
                params={"lat": lat, "lon": lon, "appid": OPENWEATHER_API_KEY, "units": "metric"},
                timeout=10
            )
            response.raise_for_status()
            data = response.json()
            
            main = data.get("main", {})
            weather = data.get("weather", [{}])[0]
            wind = data.get("wind", {})
            
            summary = f"{main.get('temp', 'N/A')}°C, {weather.get('description', 'N/A')}, wind {wind.get('speed', 'N/A')} m/s"
            return data, summary
            
        except Exception as e:
            return None, f"Weather unavailable: {e}"


def main():
    """
    Demo function showing how to use the SafeRouteAnalyzer.
    """
    print("🛣️  Safe Route Planning System")
    print("=" * 50)
    
    analyzer = SafeRouteAnalyzer(MONGO_URI)
    
    if analyzer.collection is None:
        print("❌ Cannot proceed without database connection")
        return
    
    # Get input
    try:
        print("\n📍 Enter route details:")
        start_lat = float(input("Starting latitude: "))
        start_lon = float(input("Starting longitude: "))
        end_lat = float(input("Destination latitude: "))
        end_lon = float(input("Destination longitude: "))
        
        print(f"\n🚗 Planning safe route from ({start_lat:.4f}, {start_lon:.4f}) to ({end_lat:.4f}, {end_lon:.4f})")
        
        # Find the safest route
        results = analyzer.find_safer_route(start_lat, start_lon, end_lat, end_lon)
        
        if 'error' in results:
            print(f"❌ Error: {results['error']}")
            return
        
        # Display results
        recommended = results['recommended_route']
        route_data = recommended['route_data']
        safety_data = recommended['safety_analysis']
        
        print("\n" + "="*50)
        print("🏆 RECOMMENDED SAFE ROUTE")
        print("="*50)
        print(f"📏 Distance: {route_data['distance_km']:.1f} km")
        print(f"⏱️  Duration: {route_data['duration_min']:.0f} minutes")
        print(f"🚨 Crashes nearby: {safety_data['total_crashes_near_route']}")
        print(f"📊 Safety score: {safety_data['average_safety_score']:.2f} (lower is safer)")
        
        print(f"\n🌤️  Weather: {results.get('weather_summary', 'N/A')}")
        
        print("\n📋 SAFETY ANALYSIS:")
        print("-" * 30)
        print(results['safety_report'])
        
        if len(results['alternative_routes']) > 0:
            print("\n🔄 ROUTE COMPARISON:")
            print("-" * 30)
            print(results['route_comparison'])
        
        # Output for Mapbox visualization
        coordinates = recommended['route_data']['coordinates']
        print(f"\n🗺️  Route coordinates for Mapbox ({len(coordinates)} points):")
        print("First 5 points:", coordinates[:5])
        print("Last 5 points:", coordinates[-5:])
        
        # You can save these coordinates to pass to your Mapbox visualization
        route_data_to_save = {
            'recommended_route': coordinates,
            'route_info': route_data,
            'safety_summary': {
                'total_crashes': safety_data['total_crashes_near_route'],
                'average_safety_score': safety_data['average_safety_score'],
                'max_danger_score': safety_data['max_danger_score']
            }
        }
        
        with open('safe_route_coordinates.json', 'w') as f:
            json.dump(route_data_to_save, f, indent=2)
        print("📁 Route data saved to 'safe_route_coordinates.json'")
        
    except ValueError:
        print("❌ Please enter valid numerical coordinates")
    except KeyboardInterrupt:
        print("\n⚠️  Route planning cancelled")
    except Exception as e:
        print(f"❌ Error: {e}")


if __name__ == "__main__":
    main()