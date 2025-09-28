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
MONGO_URI = "mongodb+srv://Admin:HelloKitty420@geobase.tyxsoir.mongodb.net/crashes"

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash-lite", google_api_key=GEMINI_API_KEY)

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

def get_current_weather(lat, lon):
    """
    Get current weather data from Open-Meteo API.
    """
    try:
        url = "https://api.open-meteo.com/v1/forecast"
        response = requests.get(
            url,
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "precipitation,wind_speed_10m,is_day,weather_code"
            },
            timeout=10
        )
        response.raise_for_status()
        data = response.json()
        
        current = data.get("current", {})
        
        # Map weather codes to descriptions (WMO Weather interpretation codes)
        weather_code_map = {
            0: "Clear sky",
            1: "Mainly clear",
            2: "Partly cloudy", 
            3: "Overcast",
            45: "Fog",
            48: "Depositing rime fog",
            51: "Light drizzle",
            53: "Moderate drizzle",
            55: "Dense drizzle",
            56: "Light freezing drizzle",
            57: "Dense freezing drizzle",
            61: "Slight rain",
            63: "Moderate rain",
            65: "Heavy rain",
            66: "Light freezing rain",
            67: "Heavy freezing rain",
            71: "Slight snow fall",
            73: "Moderate snow fall",
            75: "Heavy snow fall",
            77: "Snow grains",
            80: "Slight rain showers",
            81: "Moderate rain showers",
            82: "Violent rain showers",
            85: "Slight snow showers",
            86: "Heavy snow showers",
            95: "Thunderstorm",
            96: "Thunderstorm with slight hail",
            99: "Thunderstorm with heavy hail"
        }
        
        weather_code = current.get("weather_code", 0)
        weather_desc = weather_code_map.get(weather_code, "Unknown weather")
        precipitation = current.get("precipitation", 0)
        wind_speed = current.get("wind_speed_10m", 0)
        is_day = current.get("is_day", 1)
        
        day_night = "day" if is_day else "night"
        
        summary_parts = []
        summary_parts.append(f"Conditions: {weather_desc}")
        summary_parts.append(f"Precipitation: {precipitation}mm/h")
        summary_parts.append(f"Wind: {wind_speed} km/h")
        summary_parts.append(f"Time: {day_night}")
        
        summary = " | ".join(summary_parts)
        
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
    
    # Determine safety level based on crash data
    total_casualties = (crash_analysis['total_fatalities'] + 
                       crash_analysis['total_major_injuries'] + 
                       crash_analysis['total_minor_injuries'])
    
    # Calculate risk factors
    high_risk_factors = (crash_analysis['speeding_involved'] + 
                        crash_analysis['impaired_involved'] + 
                        crash_analysis['pedestrian_crashes'] + 
                        crash_analysis['bicyclist_crashes'])
    
    # Determine safety level
    if total_crashes == 0:
        safety_level = "SAFE"
    elif total_crashes <= 5 and total_casualties <= 3:
        safety_level = "LOW RISK"
    elif total_crashes <= 15 and total_casualties <= 10:
        safety_level = "MODERATE RISK"
    elif total_crashes <= 30 or total_casualties <= 25:
        safety_level = "HIGH RISK"
    else:
        safety_level = "DANGEROUS"

    weather_info = f" Current weather: {weather_summary}." if weather_summary else ""

    # Create prompt for LLM
    prompt = f"""Analyze crash safety for location ({center_lat:.4f}, {center_lon:.4f}) within {radius_km}km radius.

CRASH DATA (2020+): {total_crashes} crashes, {total_casualties} casualties
FATALITIES: {crash_analysis['total_fatalities']} fatal, {crash_analysis['total_major_injuries']} major, {crash_analysis['total_minor_injuries']} minor
RISK FACTORS: {crash_analysis['speeding_involved']} speeding, {crash_analysis['impaired_involved']} impairment, {crash_analysis['pedestrian_crashes']} pedestrian, {crash_analysis['bicyclist_crashes']} bicyclist{weather_info}

Provide a brief summary with:
• Safety Assessment: {safety_level}
• Key Risks (2-3 bullet points max)
• Safety Tips (2-3 bullet points max)
• Weather Considerations (if applicable)

Keep it concise and actionable."""
    
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
        weather_data, weather_summary = get_current_weather(center_lat, center_lon)
        
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