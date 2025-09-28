#MONGO_URI=mongodb+srv://Admin:HelloKitty420@geobase.tyxsoir.mongodb.net/crashes

import os
import requests
import time
from datetime import datetime
from pymongo import MongoClient
from langchain_google_genai import ChatGoogleGenerativeAI
from math import radians, sin, cos, sqrt, atan2

# Configuration
GEMINI_API_KEY = "AIzaSyBCbEOo4aK72507hqvpYkE9zXUe-z5aSXA"
# OPENWEATHER_API_KEY = "19c6d988b89b040b603f4b3b1b1b304f"
OPENWEATHER_API_KEY = "8754b3f387fc0f1d96a81f73e303e181"
MONGO_URI = "mongodb+srv://Admin:HelloKitty420@geobase.tyxsoir.mongodb.net/crashes"

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", api_key=GEMINI_API_KEY)

def connect_to_mongodb():
    """
    Connect to MongoDB database and return the collection.
    """
    try:
        print("Connecting to MongoDB...")
        client = MongoClient(MONGO_URI)
        # Test the connection
        client.admin.command('ping')
        print("✅ Successfully connected to MongoDB!")
        
        db = client.crashes  # Database name
        collection = db.crashes  # Collection name - corrected to 'crashes'
        
        # Get collection stats
        total_count = collection.estimated_document_count()
        print(f"📊 Found {total_count:,} total crash records in database")
        
        # Check specifically for 2020+ data
        filter_2020_plus = {"reportDate": {"$gte": datetime(2020, 1, 1)}}
        count_2020_plus = collection.count_documents(filter_2020_plus)
        print(f"📅 Found {count_2020_plus:,} crash records from 2020 onward")
        
        return collection
        
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        return None

def get_crashes_within_radius_mongodb(collection, center_lat, center_lon, radius_km):
    """
    Query MongoDB for crashes within specified radius using geospatial query.
    Filters for crashes from 2020 onward only.
    
    Args:
        collection: MongoDB collection object
        center_lat: Latitude of center point
        center_lon: Longitude of center point
        radius_km: Radius in kilometers
    
    Returns:
        List of crash documents within radius from 2020 onward
    """
    try:
        print(f"🔍 Querying crashes within {radius_km}km of ({center_lat:.6f}, {center_lon:.6f}) from 2020 onward...")
        
        # MongoDB geospatial query using $geoWithin and $centerSphere
        # $centerSphere uses radians, so convert km to radians (divide by Earth's radius in km)
        radius_radians = radius_km / 6371  # Earth's radius in km
        
        # Combined query: geospatial AND date filter for 2020+
        query = {
            "location": {
                "$geoWithin": {
                    "$centerSphere": [[center_lon, center_lat], radius_radians]
                }
            },
            "reportDate": {
                "$gte": datetime(2020, 1, 1)  # Only crashes from 2020 onward
            }
        }
        
        # Execute the query
        cursor = collection.find(query)
        crashes = list(cursor)
        
        print(f"📍 Found {len(crashes)} crashes within {radius_km}km radius (from 2020 onward)")
        
        # Add distance calculation to each crash for sorting
        for crash in crashes:
            if crash.get('location', {}).get('coordinates'):
                crash_lon, crash_lat = crash['location']['coordinates']
                distance = haversine_distance(center_lat, center_lon, crash_lat, crash_lon)
                crash['distance_km'] = distance
        
        # Sort by distance
        crashes.sort(key=lambda x: x.get('distance_km', float('inf')))
        
        return crashes
        
    except Exception as e:
        print(f"❌ Error querying MongoDB: {e}")
        return []

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    Returns distance in kilometers
    """
    # Convert decimal degrees to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    # Radius of earth in kilometers
    r = 6371
    
    return c * r

def get_current_weather(lat, lon, api_key):
    """
    Get basic weather data from OpenWeatherMap API.
    """
    try:
        url = "https://api.openweathermap.org/data/2.5/weather"
        response = requests.get(
            url,
            params={
                "lat": lat,
                "lon": lon,
                "appid": api_key,
                "units": "metric"
            },
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        # Create summary from weather API
        main = data.get("main", {})
        weather = data.get("weather", [{}])[0]
        wind = data.get("wind", {})
        
        summary_parts = []
        
        if main.get("temp") is not None:
            summary_parts.append(f"Temperature: {main['temp']:.1f}°C")
        
        if weather.get("description"):
            summary_parts.append(f"Conditions: {weather['description']}")
        
        if wind.get("speed") is not None:
            summary_parts.append(f"Wind: {wind['speed']:.1f} m/s")
        
        if main.get("humidity") is not None:
            summary_parts.append(f"Humidity: {main['humidity']}%")
        
        summary = " | ".join(summary_parts) if summary_parts else "Weather data available"
        
        return data, summary
        
    except Exception as e:
        return None, f"Weather API failed: {str(e)}"

def analyze_mongodb_crash_patterns(crashes, center_lat, center_lon, radius_km, weather_summary=None):
    """
    Analyze crash patterns from MongoDB data and generate safety assessment.
    """
    if not crashes:
        return "No crash data available for the specified location and radius."
    
    total_crashes = len(crashes)
    avg_distance = sum(crash.get('distance_km', 0) for crash in crashes) / total_crashes if crashes else 0
    
    # Analyze crash patterns from MongoDB structure
    crash_analysis = {
        'severity_counts': {},
        'total_fatalities': 0,
        'total_major_injuries': 0,
        'total_minor_injuries': 0,
        'speeding_involved': 0,
        'impaired_involved': 0,
        'pedestrian_crashes': 0,
        'bicyclist_crashes': 0,
        'vehicle_counts': {}
    }
    
    # Analyze each crash
    for crash in crashes:
        # Severity analysis
        severity = crash.get('severity', 'Unknown')
        crash_analysis['severity_counts'][severity] = crash_analysis['severity_counts'].get(severity, 0) + 1
        
        # Casualty analysis
        casualties = crash.get('casualties', {})
        
        # Count fatalities and injuries across all categories
        for category in ['bicyclists', 'drivers', 'pedestrians', 'passengers']:
            if category in casualties:
                crash_analysis['total_fatalities'] += casualties[category].get('fatal', 0)
                crash_analysis['total_major_injuries'] += casualties[category].get('major_injuries', 0)
                crash_analysis['total_minor_injuries'] += casualties[category].get('minor_injuries', 0)
        
        # Count vulnerable road user involvement
        if casualties.get('pedestrians', {}).get('total', 0) > 0:
            crash_analysis['pedestrian_crashes'] += 1
        if casualties.get('bicyclists', {}).get('total', 0) > 0:
            crash_analysis['bicyclist_crashes'] += 1
        
        # Circumstances analysis
        circumstances = crash.get('circumstances', {})
        if circumstances.get('speeding_involved', False):
            crash_analysis['speeding_involved'] += 1
        
        # Check for impairment
        if (circumstances.get('pedestrians_impaired', False) or 
            circumstances.get('bicyclists_impaired', False) or 
            circumstances.get('drivers_impaired', False)):
            crash_analysis['impaired_involved'] += 1
        
        # Vehicle analysis
        vehicles = crash.get('vehicles', {})
        total_vehicles = vehicles.get('total', 0)
        crash_analysis['vehicle_counts'][str(total_vehicles)] = crash_analysis['vehicle_counts'].get(str(total_vehicles), 0) + 1
    
    # Create comprehensive summary for LLM
    crash_summary = f"""
SEVERITY BREAKDOWN: {dict(crash_analysis['severity_counts'])}
CASUALTIES:
- Fatal injuries: {crash_analysis['total_fatalities']}
- Major injuries: {crash_analysis['total_major_injuries']}
- Minor injuries: {crash_analysis['total_minor_injuries']}
VULNERABLE ROAD USERS:
- Crashes involving pedestrians: {crash_analysis['pedestrian_crashes']}
- Crashes involving bicyclists: {crash_analysis['bicyclist_crashes']}
RISK FACTORS:
- Crashes involving speeding: {crash_analysis['speeding_involved']}
- Crashes with impairment: {crash_analysis['impaired_involved']}
VEHICLE INVOLVEMENT: {dict(crash_analysis['vehicle_counts'])}"""
    
    # Add current weather information if available
    weather_info = ""
    if weather_summary:
        weather_info = f"""

CURRENT WEATHER CONDITIONS:
{weather_summary}"""
    
    # Create prompt for LLM
    prompt = f"""You are a traffic safety expert analyzing recent crash data (2020 onward) and current conditions for location ({center_lat:.6f}, {center_lon:.6f}) within a {radius_km}km radius.
    
    CRASH STATISTICS (2020-Present):
    - Total crashes in area: {total_crashes}
    - Average distance from center: {avg_distance:.2f} km
    - Search area: {radius_km}km radius (approximately {3.14159 * radius_km**2:.1f} km²)
    
    DETAILED CRASH ANALYSIS:{crash_summary}{weather_info}
    
    Based on this comprehensive recent MongoDB crash data (2020 onward), provide:
    1. A danger level assessment (Low, Moderate, High, Very High)
    2. Key safety concerns based on recent crash patterns AND current weather conditions
    3. Specific recommendations for someone traveling to this location RIGHT NOW
    4. Notable patterns in recent crash data (severity, vulnerable users, risk factors)
    5. How current weather conditions may affect driving safety
    
    Focus on practical, actionable safety advice based on recent trends. Be specific about identified risks and provide clear recommendations."""
    
    try:
        response = llm.invoke(prompt)
        return response.content
    except Exception as e:
        return f"Error analyzing crash data with LLM: {e}"

def main():
    """
    Main function to analyze crash danger using MongoDB geospatial queries.
    """
    print("🚗 MongoDB Traffic Crash Danger Analysis Tool (2020+ Data)")
    print("=" * 65)
    
    # Connect to MongoDB
    collection = connect_to_mongodb()
    if collection is None:
        print("❌ Could not connect to MongoDB. Exiting...")
        return
    
    # Get user input for location and radius
    try:
        center_lat = float(input("Enter latitude: "))
        center_lon = float(input("Enter longitude: "))
        radius_km = float(input("Enter search radius in kilometers (default: 1.0): ") or "1.0")
        
        print(f"\n🔍 Analyzing recent crashes (2020+) within {radius_km}km of ({center_lat:.6f}, {center_lon:.6f})...")
        
        # Query MongoDB for nearby crashes using geospatial indexing
        nearby_crashes = get_crashes_within_radius_mongodb(collection, center_lat, center_lon, radius_km)
        
        if len(nearby_crashes) > 0:
            print(f"🔴 Closest crash: {nearby_crashes[0]['distance_km']:.3f}km away")
            print(f"🔴 Furthest crash: {nearby_crashes[-1]['distance_km']:.3f}km away")
            
            # Display sample crash details from MongoDB structure
            print("📊 Sample crash details from MongoDB:")
            sample = nearby_crashes[0]
            print(f"   - ID: {sample.get('crashId', 'N/A')}")
            print(f"   - Severity: {sample.get('severity', 'N/A')}")
            print(f"   - Address: {sample.get('address', 'N/A')}")
            print(f"   - Ward: {sample.get('ward', 'N/A')}")
            
            casualties = sample.get('casualties', {})
            total_casualties = 0
            for cat in ['bicyclists', 'drivers', 'pedestrians', 'passengers']:
                cat_data = casualties.get(cat, {})
                total_casualties += (cat_data.get('fatal', 0) + 
                                   cat_data.get('major_injuries', 0) + 
                                   cat_data.get('minor_injuries', 0))
            print(f"   - Total casualties: {total_casualties}")
        else:
            print("ℹ️  No crashes found within the specified radius.")
        
        # Get current weather conditions
        print("\n🌤️ Fetching current weather conditions...")
        weather_data, weather_summary = get_current_weather(center_lat, center_lon, OPENWEATHER_API_KEY)
        
        if weather_data is None:
            print(f"⚠️  Weather data unavailable: {weather_summary}")
            weather_summary = None
        else:
            print(f"🌤️  Current conditions: {weather_summary}")
        
        # Generate comprehensive safety analysis using LLM
        print("\n🤖 Generating comprehensive safety assessment...")
        analysis = analyze_mongodb_crash_patterns(nearby_crashes, center_lat, center_lon, radius_km, weather_summary)
        
        print("\n" + "="*65)
        print("🚨 RECENT CRASH SAFETY ASSESSMENT REPORT (2020-Present)")
        print("="*65)
        print(analysis)
        
    except ValueError:
        print("❌ Please enter valid numerical values for coordinates and radius.")
    except KeyboardInterrupt:
        print("\n⚠️ Analysis cancelled by user.")
    except Exception as e:
        print(f"❌ An error occurred: {e}")

if __name__ == "__main__":
    main()