from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os
import re
import traceback
from datetime import datetime
import json
from bson import ObjectId

# Ensure repo root is on sys.path so local imports work whether this script
# is run from the repo root or from inside the `llm/` folder.
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# Import our existing modules from the same llm directory
try:
    # These modules live in the `llm/` folder (not `llm/api/`), so import them
    # as local modules when running this script directly.
    from gemini_mongo_mateo import (
        connect_to_mongodb,
        get_crashes_within_radius_mongodb,
        analyze_mongodb_crash_patterns,
        get_current_weather,
    )
    from gemini_reroute_mateo import SafeRouteAnalyzer, MONGO_URI
    print("✅ Successfully imported Python modules")
except ImportError as e:
    print(f"❌ Failed to import modules: {e}")
    traceback.print_exc()
    sys.exit(1)

def serialize_mongodb_doc(doc):
    """Convert MongoDB document to JSON-serializable format"""
    if doc is None:
        return None
    
    if isinstance(doc, list):
        return [serialize_mongodb_doc(item) for item in doc]
    
    if isinstance(doc, dict):
        serialized = {}
        for key, value in doc.items():
            if isinstance(value, ObjectId):
                serialized[key] = str(value)
            elif isinstance(value, dict):
                serialized[key] = serialize_mongodb_doc(value)
            elif isinstance(value, list):
                serialized[key] = serialize_mongodb_doc(value)
            else:
                serialized[key] = value
        return serialized
    
    return doc

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize the route analyzer
route_analyzer = SafeRouteAnalyzer(MONGO_URI)

# Initialize MongoDB connection for crash analysis
mongo_collection = connect_to_mongodb()

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint to verify API is running."""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'mongodb_connected': mongo_collection is not None,
        'route_analyzer_ready': route_analyzer.collection is not None
    })

@app.route('/api/weather', methods=['GET'])
def get_weather_endpoint():
    """Get current weather conditions for given coordinates."""
    try:
        lat = float(request.args.get('lat'))
        lon = float(request.args.get('lon'))
        
        weather_data, weather_summary = get_current_weather(lat, lon)
        
        if weather_data is None:
            return jsonify({
                'success': False,
                'error': weather_summary
            }), 400
        
        return jsonify({
            'success': True,
            'weather_data': weather_data,
            'summary': weather_summary,
            'coordinates': {'lat': lat, 'lon': lon}
        })
        
    except (TypeError, ValueError) as e:
        return jsonify({
            'success': False,
            'error': 'Invalid latitude or longitude provided'
        }), 400
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/analyze-crashes', methods=['POST'])
def analyze_crashes_endpoint():
    """Analyze crash patterns and safety for a specific location."""
    try:
        if mongo_collection is None:
            return jsonify({
                'success': False,
                'error': 'Database connection not available'
            }), 500
        
        # More robust JSON parsing
        data = request.get_json(force=True)
        if not data:
            return jsonify({
                'success': False,
                'error': 'No valid JSON data provided'
            }), 400
        
        try:
            lat = float(data.get('lat'))
            lon = float(data.get('lon'))
            radius_km = float(data.get('radius', 1.0))
        except (TypeError, ValueError) as e:
            return jsonify({
                'success': False,
                'error': f'Invalid coordinates: lat={data.get("lat")}, lon={data.get("lon")}, radius={data.get("radius", 1.0)}'
            }), 400
        
        print(f"🔍 Analyzing crashes at ({lat:.4f}, {lon:.4f}) within {radius_km}km...")
        
        # Get crashes within radius
        crashes = get_crashes_within_radius_mongodb(mongo_collection, lat, lon, radius_km)
        
        # Serialize MongoDB documents to handle ObjectId
        crashes_serialized = serialize_mongodb_doc(crashes)
        
        # Get current weather
        weather_data, weather_summary = get_current_weather(lat, lon)
        
        # Generate safety analysis using LLM
        safety_analysis = analyze_mongodb_crash_patterns(
            crashes, lat, lon, radius_km, weather_summary
        )
        
        # Clean up safety analysis text - remove ALL markdown formatting
        if safety_analysis:
            # Remove markdown headers (### ** ##)
            safety_analysis = re.sub(r'#+\s*', '', safety_analysis)
            # Remove bold formatting (**text**)
            safety_analysis = re.sub(r'\*\*([^*]+)\*\*', r'\1', safety_analysis)
            # Remove italic formatting (*text*)
            safety_analysis = re.sub(r'\*([^*]+)\*', r'\1', safety_analysis)
            # Convert markdown bullet points to clean bullets
            safety_analysis = re.sub(r'^\s*[-*+]\s*', '• ', safety_analysis, flags=re.MULTILINE)
            # Remove markdown code blocks
            safety_analysis = re.sub(r'```[^`]*```', '', safety_analysis)
            safety_analysis = re.sub(r'`([^`]+)`', r'\1', safety_analysis)
            # Remove markdown links [text](url)
            safety_analysis = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', safety_analysis)
            # Clean up multiple newlines but preserve structure
            safety_analysis = re.sub(r'\n\s*\n\s*\n', '\n\n', safety_analysis)
            # Clean up extra spaces within lines
            safety_analysis = re.sub(r'[ \t]+', ' ', safety_analysis)
            safety_analysis = safety_analysis.strip()
        
        # Calculate some basic statistics
        total_crashes = len(crashes)
        avg_distance = sum(crash.get('distance_km', 0) for crash in crashes) / total_crashes if crashes else 0
        
        # Extract crash summary stats
        severity_counts = {}
        total_casualties = 0
        for crash in crashes:
            severity = crash.get('severity', 'Unknown')
            severity_counts[severity] = severity_counts.get(severity, 0) + 1
            
            casualties = crash.get('casualties', {})
            for category in ['bicyclists', 'drivers', 'pedestrians', 'passengers']:
                if category in casualties:
                    cat_data = casualties[category]
                    total_casualties += (cat_data.get('fatal', 0) + 
                                       cat_data.get('major_injuries', 0) + 
                                       cat_data.get('minor_injuries', 0))
        
        return jsonify({
            'success': True,
            'location': {'lat': lat, 'lon': lon},
            'radius_km': radius_km,
            'crash_summary': {
                'total_crashes': total_crashes,
                'avg_distance_km': round(avg_distance, 3),
                'severity_breakdown': severity_counts,
                'total_casualties': total_casualties
            },
            'weather': {
                'summary': weather_summary,
                'data': weather_data
            },
            'safety_analysis': safety_analysis,
            'raw_crashes': crashes_serialized[:10] if crashes_serialized else []  # Return first 10 for reference
        })
        
    except Exception as e:
        print(f"❌ Error in crash analysis: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/find-safe-route', methods=['POST'])
def find_safe_route_endpoint():
    """Find the safest route between two points with crash analysis."""
    try:
        if route_analyzer.collection is None:
            return jsonify({
                'success': False,
                'error': 'Route analyzer not available'
            }), 500
        
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No route data provided'
            }), 400
        
        start_lat = float(data.get('start_lat'))
        start_lon = float(data.get('start_lon'))
        end_lat = float(data.get('end_lat'))
        end_lon = float(data.get('end_lon'))
        
        print(f"🛣️ Finding safe route from ({start_lat:.4f}, {start_lon:.4f}) to ({end_lat:.4f}, {end_lon:.4f})...")
        
        # Find the safest route
        results = route_analyzer.find_safer_route(start_lat, start_lon, end_lat, end_lon)
        
        if 'error' in results:
            return jsonify({
                'success': False,
                'error': results['error']
            }), 500
        
        # Extract key information for frontend
        recommended_route = results['recommended_route']
        route_data = recommended_route['route_data']
        safety_data = recommended_route['safety_analysis']
        
        # Prepare response
        response_data = {
            'success': True,
            'start_coordinates': {'lat': start_lat, 'lon': start_lon},
            'end_coordinates': {'lat': end_lat, 'lon': end_lon},
            'recommended_route': {
                'coordinates': route_data['coordinates'],  # For Mapbox visualization
                'distance_km': route_data['distance_km'],
                'duration_min': route_data['duration_min'],
                'geometry': route_data.get('geometry'),  # GeoJSON for Mapbox
                'safety_score': safety_data['average_safety_score'],
                'crashes_nearby': safety_data['total_crashes_near_route'],
                'max_danger_score': safety_data['max_danger_score']
            },
            'safety_analysis': results['safety_report'],
            'weather_summary': results.get('weather_summary'),
            'route_comparison': results.get('route_comparison'),
            'alternative_routes': []
        }
        
        # Add alternative routes if available
        for alt_route in results.get('alternative_routes', []):
            alt_data = alt_route['route_data']
            alt_safety = alt_route['safety_analysis']
            response_data['alternative_routes'].append({
                'route_id': alt_data['route_id'],
                'coordinates': alt_data['coordinates'],
                'distance_km': alt_data['distance_km'],
                'duration_min': alt_data['duration_min'],
                'geometry': alt_data.get('geometry'),
                'safety_score': alt_safety['average_safety_score'],
                'crashes_nearby': alt_safety['total_crashes_near_route']
            })
        
        return jsonify(response_data)
        
    except (TypeError, ValueError) as e:
        return jsonify({
            'success': False,
            'error': 'Invalid route coordinates provided'
        }), 400
    except Exception as e:
        print(f"❌ Error in route finding: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/get-single-route', methods=['POST'])
def get_single_route_endpoint():
    """Get a single route with safety analysis (simpler version)."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        start_lat = float(data.get('start_lat'))
        start_lon = float(data.get('start_lon'))
        end_lat = float(data.get('end_lat'))
        end_lon = float(data.get('end_lon'))
        profile = data.get('profile', 'driving')  # driving, walking, cycling
        
        # Get route from Mapbox
        route_result = route_analyzer.get_route_from_mapbox(
            start_lat, start_lon, end_lat, end_lon, profile
        )
        
        if not route_result.get('success'):
            return jsonify({
                'success': False,
                'error': route_result.get('error', 'Failed to get route')
            }), 500
        
        # Analyze route safety
        safety_analysis = route_analyzer.analyze_route_safety(route_result['coordinates'])
        
        if 'error' in safety_analysis:
            return jsonify({
                'success': False,
                'error': safety_analysis['error']
            }), 500
        
        # Get weather
        weather_data, weather_summary = route_analyzer.get_current_weather(start_lat, start_lon)
        
        # Generate safety report
        safety_report = route_analyzer.generate_safety_report_with_llm(
            safety_analysis, route_result, weather_summary
        )
        
        return jsonify({
            'success': True,
            'route': {
                'coordinates': route_result['coordinates'],
                'distance_km': route_result['distance_km'],
                'duration_min': route_result['duration_min'],
                'geometry': route_result.get('geometry'),
                'profile': profile
            },
            'safety': {
                'total_crashes_nearby': safety_analysis['total_crashes_near_route'],
                'average_safety_score': safety_analysis['average_safety_score'],
                'max_danger_score': safety_analysis['max_danger_score'],
                'safety_points': safety_analysis['safety_points']
            },
            'safety_report': safety_report,
            'weather_summary': weather_summary
        })
        
    except Exception as e:
        print(f"❌ Error getting single route: {e}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict_crash_magnitude():
    """
    Predict crash magnitude for a route using AI model.
    Expected request body:
    {
        "source": {"lat": float, "lon": float},
        "destination": {"lat": float, "lon": float}
    }
    """
    # Handle preflight CORS request
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
            
        # Validate required fields
        if 'source' not in data or 'destination' not in data:
            return jsonify({'error': 'Missing source or destination coordinates'}), 400
            
        source = data['source']
        destination = data['destination']
        
        # Validate coordinate format
        required_fields = ['lat', 'lon']
        for coord_set, name in [(source, 'source'), (destination, 'destination')]:
            for field in required_fields:
                if field not in coord_set:
                    return jsonify({'error': f'Missing {field} in {name} coordinates'}), 400
                try:
                    float(coord_set[field])
                except (TypeError, ValueError):
                    return jsonify({'error': f'Invalid {field} value in {name} coordinates'}), 400
        
        # For now, return a mock prediction based on distance
        # In a real implementation, this would call your AI model
        import math
        
        lat1, lon1 = float(source['lat']), float(source['lon'])
        lat2, lon2 = float(destination['lat']), float(destination['lon'])
        
        # Calculate distance (rough approximation)
        distance = math.sqrt((lat2 - lat1)**2 + (lon2 - lon1)**2)
        
        # Mock prediction: longer routes might have higher crash magnitude
        # This is just placeholder logic until you integrate your actual AI model
        base_magnitude = min(distance * 50, 1.0)  # Cap at 1.0
        confidence = 0.85  # Mock confidence
        
        response_data = {
            'prediction': {
                'prediction': base_magnitude,
                'confidence': confidence
            },
            'called_with': f"Route from ({lat1}, {lon1}) to ({lat2}, {lon2})",
            'diagnostics': {
                'input_dim': 4  # lat1, lon1, lat2, lon2
            }
        }
        
        print(f"🔮 Crash magnitude prediction request: {data}")
        print(f"📊 Returning prediction: {response_data['prediction']['prediction']:.3f}")
        
        response = jsonify(response_data)
        response.headers.add('Access-Control-Allow-Origin', '*')
        return response
        
    except Exception as e:
        print(f"❌ Error in crash magnitude prediction: {e}")
        traceback.print_exc()
        error_response = jsonify({'error': str(e)})
        error_response.headers.add('Access-Control-Allow-Origin', '*')
        return error_response, 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'error': 'Internal server error'}), 500

if __name__ == '__main__':
    print("🚀 Starting Flask API Server...")
    print("📡 Endpoints available:")
    print("   - GET  /api/health")
    print("   - GET  /api/weather?lat=X&lon=Y")
    print("   - POST /api/analyze-crashes")
    print("   - POST /api/find-safe-route")
    print("   - POST /api/get-single-route")
    print("   - POST /predict (AI crash magnitude prediction)")
    print("\n🌐 Server running on http://localhost:5001")
    
    app.run(debug=True, host='0.0.0.0', port=5001)