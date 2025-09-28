#!/usr/bin/env python3
"""
Test script for Flask API endpoints.
"""

import requests
import json
import time

API_BASE = "http://localhost:5001/api"

def test_health():
    """Test health endpoint"""
    print("🔍 Testing health endpoint...")
    try:
        response = requests.get(f"{API_BASE}/health")
        print(f"Status: {response.status_code}")
        data = response.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        if data.get('status') == 'healthy':
            print("✅ Health check passed!")
        else:
            print("⚠️  Health check shows issues")
        return True
    except Exception as e:
        print(f"❌ Health check failed: {e}")
        return False
    finally:
        print()

def test_weather():
    """Test weather endpoint"""
    print("🌤️ Testing weather endpoint...")
    try:
        # Test with Virginia Tech coordinates
        response = requests.get(f"{API_BASE}/weather", params={'lat': 37.2284, 'lon': -80.4234})
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if data.get('success'):
            print(f"✅ Weather: {data['summary']}")
            print(f"   Coordinates: ({data['coordinates']['lat']}, {data['coordinates']['lon']})")
        else:
            print(f"❌ Weather API error: {data.get('error')}")
        return data.get('success', False)
    except Exception as e:
        print(f"❌ Weather test failed: {e}")
        return False
    finally:
        print()

def test_crash_analysis():
    """Test crash analysis endpoint"""
    print("🚨 Testing crash analysis endpoint...")
    try:
        payload = {
            'lat': 37.2284,  # Virginia Tech
            'lon': -80.4234,
            'radius': 2.0
        }
        response = requests.post(f"{API_BASE}/analyze-crashes", json=payload)
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if data.get('success'):
            print("✅ Crash analysis successful!")
            crash_summary = data['crash_summary']
            print(f"   Total crashes: {crash_summary['total_crashes']}")
            print(f"   Total casualties: {crash_summary['total_casualties']}")
            print(f"   Average distance: {crash_summary['avg_distance_km']} km")
            print(f"   Weather: {data['weather']['summary']}")
            
            if crash_summary['severity_breakdown']:
                print("   Severity breakdown:")
                for severity, count in crash_summary['severity_breakdown'].items():
                    print(f"     - {severity}: {count}")
        else:
            print(f"❌ Crash analysis error: {data.get('error')}")
        return data.get('success', False)
    except Exception as e:
        print(f"❌ Crash analysis test failed: {e}")
        return False
    finally:
        print()

def test_route_finding():
    """Test safe route finding endpoint"""
    print("🛣️ Testing route finding endpoint...")
    try:
        payload = {
            'start_lat': 37.2284,  # Virginia Tech
            'start_lon': -80.4234,
            'end_lat': 37.2297,    # Downtown Blacksburg
            'end_lon': -80.4139
        }
        response = requests.post(f"{API_BASE}/find-safe-route", json=payload)
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if data.get('success'):
            print("✅ Route finding successful!")
            route = data['recommended_route']
            print(f"   Distance: {route['distance_km']:.2f} km")
            print(f"   Duration: {route['duration_min']:.1f} minutes")
            print(f"   Crashes nearby: {route['crashes_nearby']}")
            print(f"   Safety score: {route['safety_score']:.3f}")
            print(f"   Coordinate points: {len(route['coordinates'])}")
            
            if data.get('weather_summary'):
                print(f"   Weather: {data['weather_summary']}")
                
            print(f"   Alternative routes: {len(data['alternative_routes'])}")
        else:
            print(f"❌ Route finding error: {data.get('error')}")
        return data.get('success', False)
    except Exception as e:
        print(f"❌ Route finding test failed: {e}")
        return False
    finally:
        print()

def test_single_route():
    """Test single route endpoint"""
    print("🗺️ Testing single route endpoint...")
    try:
        payload = {
            'start_lat': 37.2284,  # Virginia Tech
            'start_lon': -80.4234,
            'end_lat': 37.2297,    # Downtown Blacksburg
            'end_lon': -80.4139,
            'profile': 'driving'
        }
        response = requests.post(f"{API_BASE}/get-single-route", json=payload)
        print(f"Status: {response.status_code}")
        data = response.json()
        
        if data.get('success'):
            print("✅ Single route successful!")
            route = data['route']
            safety = data['safety']
            print(f"   Distance: {route['distance_km']:.2f} km")
            print(f"   Duration: {route['duration_min']:.1f} minutes")
            print(f"   Profile: {route['profile']}")
            print(f"   Total crashes nearby: {safety['total_crashes_nearby']}")
            print(f"   Safety score: {safety['average_safety_score']:.3f}")
            print(f"   Max danger score: {safety['max_danger_score']:.3f}")
            
            if data.get('weather_summary'):
                print(f"   Weather: {data['weather_summary']}")
        else:
            print(f"❌ Single route error: {data.get('error')}")
        return data.get('success', False)
    except Exception as e:
        print(f"❌ Single route test failed: {e}")
        return False
    finally:
        print()

def main():
    print("🧪 Testing Flask API Endpoints")
    print("=" * 50)
    
    # Check if server is running
    try:
        requests.get(f"{API_BASE}/health", timeout=5)
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to Flask server.")
        print("   Make sure the server is running: python api/flask_server.py")
        return
    except Exception as e:
        print(f"❌ Error connecting to server: {e}")
        return
    
    # Run all tests
    results = []
    results.append(("Health Check", test_health()))
    results.append(("Weather API", test_weather()))
    results.append(("Crash Analysis", test_crash_analysis()))
    results.append(("Route Finding", test_route_finding()))
    results.append(("Single Route", test_single_route()))
    
    # Summary
    print("=" * 50)
    print("🎯 TEST SUMMARY:")
    print("=" * 50)
    
    passed = 0
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"   {test_name:<20} {status}")
        if result:
            passed += 1
    
    print(f"\nResults: {passed}/{len(results)} tests passed")
    
    if passed == len(results):
        print("🎉 All tests passed! Flask API is ready for Next.js integration!")
    else:
        print("⚠️  Some tests failed. Please check the server logs.")

if __name__ == "__main__":
    main()