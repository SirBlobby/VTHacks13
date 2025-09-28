from flask import Flask, request, jsonify
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
import os
import threading
import json

# ML imports are lazy to avoid heavy imports on simple runs


@app.route('/get-data', methods=['GET'])
def get_data():
    # Example GET request handler
    data = {"message": "Hello from Flask!"}
    return jsonify(data)

@app.route('/post-data', methods=['POST'])
def post_data():
    # Example POST request handler
    content = request.json
    # Process content or call AI model here
    response = {"you_sent": content}
    return jsonify(response)


@app.route('/train', methods=['POST'])
def train_endpoint():
    """Trigger training. Expects JSON: {"data_root": "path/to/data", "epochs": 3}
    Training runs in a background thread and saves model to model.pth in repo root.
    """
    payload = request.json or {}
    data_root = payload.get('data_root')
    epochs = int(payload.get('epochs', 3))
    if not data_root or not os.path.isdir(data_root):
        return jsonify({"error": "data_root must be a valid directory path"}), 400

    def _run_training():
        from train import train
        train(data_root, epochs=epochs)

    t = threading.Thread(target=_run_training, daemon=True)
    t.start()
    return jsonify({"status": "training_started"})


@app.route('/predict', methods=['POST', 'GET'])
def predict_endpoint():
    """Predict route between two points given source and destination with lat and lon.

    Expectation:
    - POST with JSON: {"source": {"lat": .., "lon": ..}, "destination": {"lat": .., "lon": ..}}
    - GET returns usage instructions for quick browser testing.
    """
    if request.method == 'GET':
        return jsonify({
            "info": "This endpoint expects a POST with JSON body.",
            "example": {
                "source": {"lat": 38.9, "lon": -77.0},
                "destination": {"lat": 38.95, "lon": -77.02}
            },
            "note": "Use POST to receive a prediction. Example: curl -X POST -H 'Content-Type: application/json' -d '{\"source\": {\"lat\": 38.9, \"lon\": -77.0}, \"destination\": {\"lat\": 38.95, \"lon\": -77.02}}' http://127.0.0.1:5000/predict"
        }), 200

    data = request.json or {}
    source = data.get('source')
    destination = data.get('destination')
    if not source or not destination:
        return jsonify({"error": "both 'source' and 'destination' fields are required"}), 400
    try:
        src_lat = float(source.get('lat'))
        src_lon = float(source.get('lon'))
        dst_lat = float(destination.get('lat'))
        dst_lon = float(destination.get('lon'))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid lat or lon values; must be numbers"}), 400

    # Ensure compute_reroute exists and is callable
    try:
        from openweather_client import compute_reroute
    except Exception as e:
        return jsonify({
            "error": "compute_reroute not found in openweather_client",
            "detail": str(e),
            "hint": "Provide openweather_client.compute_reroute or implement a callable that accepts (src_lat, src_lon, dst_lat, dst_lon)"
        }), 500

    if not callable(compute_reroute):
        return jsonify({"error": "openweather_client.compute_reroute is not callable"}), 500

    # Call compute_reroute with fallback strategies
    try:
        try:
            result = compute_reroute(src_lat, src_lon, dst_lat, dst_lon)
        except TypeError:
            # fallback: single payload dict
            payload = {'source': {'lat': src_lat, 'lon': src_lon}, 'destination': {'lat': dst_lat, 'lon': dst_lon}}
            result = compute_reroute(payload)

        # Normalize response
        if isinstance(result, dict):
            return jsonify(result)
        else:
            return jsonify({"result": result})
    except Exception as e:
        return jsonify({"error": "compute_reroute invocation failed", "detail": str(e)}), 500


@app.route('/')
def home():
    return "<h1>Welcome to the Flask App</h1><p>Try /get-data or /health endpoints.</p>"

@app.route('/predict-roadrisk', methods=['POST'])
def predict_roadrisk():
    """Proxy endpoint to predict a roadrisk cluster from lat/lon/datetime.

    Expects JSON body with: {"lat": 38.9, "lon": -77.0, "datetime": "2025-09-27T12:00:00", "roadrisk_url": "https://..."}
    If roadrisk_url is not provided the endpoint will call OpenWeather OneCall (requires API key via OPENWEATHER_KEY env var).
    """
    payload = request.json or {}
    lat = payload.get('lat')
    lon = payload.get('lon')
    dt = payload.get('datetime')
    street = payload.get('street', '')
    roadrisk_url = payload.get('roadrisk_url')
    # prefer explicit api_key in request, otherwise read from OPENWEATHER_API_KEY env var
    api_key = payload.get('api_key') or os.environ.get('OPENWEATHER_API_KEY')

    if lat is None or lon is None:
        return jsonify({"error": "lat and lon are required fields"}), 400

    try:
        from openweather_inference import predict_from_openweather
        # pass api_key (may be None) to the inference helper; helper will raise if a key is required
        res = predict_from_openweather(
            lat, lon,
            dt_iso=dt,
            street=street,
            api_key=api_key,
            train_csv=os.path.join(os.getcwd(), 'data.csv'),
            preprocess_meta=None,
            model_path=os.path.join(os.getcwd(), 'model.pth'),
            centers_path=os.path.join(os.getcwd(), 'kmeans_centers_all.npz'),
            roadrisk_url=roadrisk_url
        )
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Return status of loaded ML artifacts (model, centers, preprocess_meta)."""
    try:
        from openweather_inference import init_inference
        status = init_inference()
        return jsonify({'ok': True, 'artifacts': status})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

if __name__ == '__main__':
    # eager load model/artifacts at startup (best-effort)
    try:
        from openweather_inference import init_inference
        init_inference()
    except Exception:
        pass
    app.run(debug=True)

# @app.route('/post-data', methods=['POST'])
# def post_data():
#     content = request.json
#     user_input = content.get('input')

#     # Example: Simple echo AI (replace with real AI model code)
#     ai_response = f"AI received: {user_input}"

#     return jsonify({"response": ai_response})
#     ai_response = f"AI received: {user_input}"

#     return jsonify({"response": ai_response"})
