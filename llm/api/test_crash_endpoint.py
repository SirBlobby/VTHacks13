#!/usr/bin/env python3
"""
Quick test script for the crash analysis endpoint
"""

import requests
import json

def test_crash_analysis():
    """Test the crash analysis endpoint"""
    
    url = "http://localhost:5001/api/analyze-crashes"
    
    # Test data - Washington DC coordinates
    payload = {
        "lat": 38.9072,
        "lon": -77.0369,
        "radius": 1.0
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    print("🧪 Testing Crash Analysis Endpoint")
    print("=" * 50)
    print(f"URL: {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    print(f"Headers: {headers}")
    print()
    
    try:
        print("📡 Sending request...")
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        
        print(f"📊 Response Status: {response.status_code}")
        print(f"📋 Response Headers: {dict(response.headers)}")
        print()
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print("✅ SUCCESS! Crash analysis endpoint is working!")
                print()
                print("📈 Results Summary:")
                crash_summary = data.get('crash_summary', {})
                print(f"  • Total crashes: {crash_summary.get('total_crashes', 'N/A')}")
                print(f"  • Average distance: {crash_summary.get('avg_distance_km', 'N/A')} km")
                print(f"  • Total casualties: {crash_summary.get('total_casualties', 'N/A')}")
                
                weather = data.get('weather', {})
                print(f"  • Weather: {weather.get('summary', 'N/A')}")
                
                safety_analysis = data.get('safety_analysis', '')
                print(f"  • Safety analysis length: {len(safety_analysis)} characters")
                
                raw_crashes = data.get('raw_crashes', [])
                print(f"  • Sample crashes returned: {len(raw_crashes)}")
                
                return True
            else:
                print(f"❌ API returned success=False: {data.get('error', 'Unknown error')}")
                return False
                
        else:
            print(f"❌ HTTP Error {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error details: {error_data}")
            except:
                print(f"Response text: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Connection Error: Cannot connect to Flask server")
        print("   Make sure the Flask server is running on http://localhost:5001")
        print("   Start it with: cd llm && python api/flask_server.py")
        return False
        
    except requests.exceptions.Timeout:
        print("❌ Timeout Error: Request took too long (>30 seconds)")
        print("   This might be normal for the first request as it loads data")
        return False
        
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")
        return False

def test_health_first():
    """Test health endpoint first to make sure server is running"""
    try:
        response = requests.get("http://localhost:5001/api/health", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print("✅ Health check passed")
            print(f"  • MongoDB connected: {data.get('mongodb_connected')}")
            print(f"  • Route analyzer ready: {data.get('route_analyzer_ready')}")
            return True
        else:
            print(f"❌ Health check failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Flask Server Crash Analysis Test")
    print("=" * 60)
    
    # Test health first
    if not test_health_first():
        print("\n💡 Server not responding. Start it with:")
        print("   cd /Users/shivapochampally/Documents/competitions/VTHacks13/llm")
        print("   python api/flask_server.py")
        exit(1)
    
    print()
    
    # Test crash analysis
    success = test_crash_analysis()
    
    print("\n" + "=" * 60)
    if success:
        print("🎉 All tests passed! Your crash analysis endpoint is working perfectly!")
    else:
        print("❌ Test failed. Check the error messages above.")