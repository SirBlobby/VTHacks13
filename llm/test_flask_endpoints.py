"""
Lightweight tests for llm/flask_server.py endpoints.
This script injects fake local modules to avoid external network/DB calls,
imports the flask app, and uses Flask's test_client to call endpoints.
"""
import sys
import os
import types
import json
import traceback

# Prepare fake modules to avoid external dependencies (MongoDB, external APIs, LLMs)
fake_mongo = types.ModuleType("gemini_mongo_mateo")

def fake_connect_to_mongodb():
    # Return a simple truthy object representing a connection/collection
    return {"fake": "collection"}

def fake_get_crashes_within_radius_mongodb(collection, lat, lon, radius_km):
    return []

def fake_analyze_mongodb_crash_patterns(crashes, lat, lon, radius_km, weather_summary=None):
    return "No crash data available (fake)"

def fake_get_current_weather(lat, lon):
    return ({"temp": 20, "weather_code": 0}, "Clear sky")

fake_mongo.connect_to_mongodb = fake_connect_to_mongodb
fake_mongo.get_crashes_within_radius_mongodb = fake_get_crashes_within_radius_mongodb
fake_mongo.analyze_mongodb_crash_patterns = fake_analyze_mongodb_crash_patterns
fake_mongo.get_current_weather = fake_get_current_weather
fake_mongo.MONGO_URI = "mongodb://fake"

# Fake reroute module
fake_reroute = types.ModuleType("gemini_reroute_mateo")

class FakeSafeRouteAnalyzer:
    def __init__(self, uri):
        self.collection = {"fake": "collection"}

    def find_safer_route(self, start_lat, start_lon, end_lat, end_lon):
        return {
            'recommended_route': {
                'route_data': {
                    'coordinates': [[start_lat, start_lon], [end_lat, end_lon]],
                    'distance_km': 1.23,
                    'duration_min': 4.5,
                    'geometry': None
                },
                'safety_analysis': {
                    'average_safety_score': 0.0,
                    'total_crashes_near_route': 0,
                    'max_danger_score': 0.0
                }
            },
            'safety_report': 'All good (fake)',
            'alternative_routes': []
        }

    def get_route_from_mapbox(self, start_lat, start_lon, end_lat, end_lon, profile='driving'):
        return {
            'success': True,
            'coordinates': [[start_lat, start_lon], [end_lat, end_lon]],
            'distance_km': 1.0,
            'duration_min': 3.0,
            'geometry': None
        }

    def analyze_route_safety(self, coordinates):
        return {
            'total_crashes_near_route': 0,
            'average_safety_score': 0.0,
            'max_danger_score': 0.0,
            'safety_points': [],
            'crashes_data': [],
            'route_length_points': len(coordinates)
        }

    def get_current_weather(self, lat, lon):
        return fake_get_current_weather(lat, lon)

    def generate_safety_report_with_llm(self, safety_data, route_info, weather_summary=None):
        return "Fake LLM report"

fake_reroute.SafeRouteAnalyzer = FakeSafeRouteAnalyzer
fake_reroute.MONGO_URI = "mongodb://fake"

# Insert fake modules into sys.modules so importing flask_server uses them
sys.modules['gemini_mongo_mateo'] = fake_mongo
sys.modules['gemini_reroute_mateo'] = fake_reroute

# Also provide package-style names in case flask_server tries them
sys.modules['llm.gemini_mongo_mateo'] = fake_mongo
sys.modules['llm.gemini_reroute_mateo'] = fake_reroute

# If Flask isn't installed in the environment, provide a minimal fake
# implementation sufficient for this test: Flask, request, jsonify and a
# test_client that can call registered route handlers.
if 'flask' not in sys.modules:
    import types

    flask_mod = types.ModuleType('flask')

    class FakeRequest:
        def __init__(self):
            self.args = {}
            self._json = None

        def get_json(self, force=False):
            return self._json

    class FakeResponse:
        def __init__(self, data, status_code=200):
            self.data = data
            self.status_code = status_code

        def get_json(self):
            # If data already a dict, return it; if string, try parse
            if isinstance(self.data, dict):
                return self.data
            try:
                return json.loads(self.data)
            except Exception:
                return None

    class FakeApp:
        def __init__(self, name=None):
            self._routes = {}
            self.request = FakeRequest()

        def route(self, path, methods=None):
            methods = methods or ['GET']
            def decorator(fn):
                self._routes[(path, tuple(sorted(methods)))] = fn
                # Also store by path for simpler lookup
                self._routes[path] = fn
                return fn
            return decorator

        def test_client(self):
            app = self
            class Client:
                def get(self, path):
                    # parse querystring
                    if '?' in path:
                        route, qs = path.split('?', 1)
                        params = {}
                        for pair in qs.split('&'):
                            if '=' in pair:
                                k, v = pair.split('=', 1)
                                params[k] = v
                    else:
                        route = path
                        params = {}
                    app.request.args = params
                    handler = app._routes.get(route)
                    if handler is None:
                        return FakeResponse({'error': 'not found'}, status_code=404)
                    try:
                        result = handler()
                        if isinstance(result, tuple):
                            body, code = result
                            return FakeResponse(body, status_code=code)
                        return FakeResponse(result, status_code=200)
                    except Exception as e:
                        return FakeResponse({'error': str(e)}, status_code=500)

                def post(self, path, json=None):
                    app.request._json = json
                    handler = app._routes.get(path)
                    if handler is None:
                        return FakeResponse({'error': 'not found'}, status_code=404)
                    try:
                        result = handler()
                        if isinstance(result, tuple):
                            body, code = result
                            return FakeResponse(body, status_code=code)
                        return FakeResponse(result, status_code=200)
                    except Exception as e:
                        traceback.print_exc()
                        return FakeResponse({'error': str(e)}, status_code=500)

            return Client()

        def errorhandler(self, code):
            def decorator(fn):
                # store error handlers by code
                if not hasattr(self, '_error_handlers'):
                    self._error_handlers = {}
                self._error_handlers[code] = fn
                return fn
            return decorator

    def fake_jsonify(obj):
        return obj

    # Populate module
    flask_mod.Flask = FakeApp
    flask_mod.request = FakeRequest()
    flask_mod.jsonify = fake_jsonify

    sys.modules['flask'] = flask_mod

# Minimal flask_cors shim
if 'flask_cors' not in sys.modules:
    fc = types.ModuleType('flask_cors')
    def fake_CORS(app):
        return None
    fc.CORS = fake_CORS
    sys.modules['flask_cors'] = fc

# Load flask_server module from file without executing its __main__ block
import importlib.util

this_dir = os.path.dirname(__file__)
flask_file = os.path.join(this_dir, 'flask_server.py')

spec = importlib.util.spec_from_file_location('flask_server', flask_file)
flask_server = importlib.util.module_from_spec(spec)
# Ensure the module sees the fake modules we inserted
sys.modules['flask_server'] = flask_server
try:
    spec.loader.exec_module(flask_server)
except Exception as e:
    print('Failed to import flask_server:', e)
    traceback.print_exc()
    sys.exit(2)

app = getattr(flask_server, 'app', None)
if app is None:
    print('flask_server.app not found')
    sys.exit(3)

client = app.test_client()

results = {}

# 1) Health
r = client.get('/api/health')
try:
    results['health'] = {'status_code': r.status_code, 'json': r.get_json()}
except Exception:
    results['health'] = {'status_code': r.status_code, 'data': r.data.decode('utf-8')}

# 2) Weather (valid coords)
r = client.get('/api/weather?lat=38.9072&lon=-77.0369')
results['weather_ok'] = {'status_code': r.status_code, 'json': r.get_json()}

# 3) Weather (invalid coords)
r = client.get('/api/weather')
results['weather_invalid'] = {'status_code': r.status_code, 'json': r.get_json()}

# 4) Analyze crashes (POST)
payload = {'lat': 38.9072, 'lon': -77.0369, 'radius': 1.0}
r = client.post('/api/analyze-crashes', json=payload)
results['analyze_crashes'] = {'status_code': r.status_code, 'json': r.get_json()}

# 5) Find safe route
route_payload = {'start_lat': 38.9, 'start_lon': -77.0, 'end_lat': 38.95, 'end_lon': -77.04}
r = client.post('/api/find-safe-route', json=route_payload)
results['find_safe_route'] = {'status_code': r.status_code, 'json': r.get_json()}

# 6) Get single route
single_payload = {'start_lat': 38.9, 'start_lon': -77.0, 'end_lat': 38.95, 'end_lon': -77.04}
r = client.post('/api/get-single-route', json=single_payload)
results['get_single_route'] = {'status_code': r.status_code, 'json': r.get_json()}

print('\n=== Endpoint test results ===')
print(json.dumps(results, indent=2, default=str))

# Summarize endpoints
summary = {
    '/api/health': 'GET - returns service + dependency health',
    '/api/weather': 'GET - requires lat & lon query params; returns current weather from LLM module',
    '/api/analyze-crashes': 'POST - requires JSON {lat, lon, radius}; returns crash summary, weather, LLM safety analysis',
    '/api/find-safe-route': 'POST - requires JSON start_lat,start_lon,end_lat,end_lon; returns recommended route with safety analysis',
    '/api/get-single-route': 'POST - similar to find-safe-route but returns single route + LLM safety report'
}

print('\n=== Endpoint summary ===')
for path, desc in summary.items():
    print(f"{path}: {desc}")

# Exit code 0
sys.exit(0)
