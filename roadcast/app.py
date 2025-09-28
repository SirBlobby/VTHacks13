from flask import Flask, request, jsonify
from dotenv import load_dotenv
from openmeteo_client import compute_index

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
import os
import threading
import json

# ML imports are lazy to avoid heavy imports on simple runs

@app.route('/')
def home():
    return "<h1>Welcome to the Flask App</h1><p>Try /get-data or /health endpoints.</p>"

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

@app.route('/health', methods=['GET'])
def health():
    """Return status of loaded ML artifacts (model, centers, preprocess_meta)."""
    try:
        from openmeteo_inference import init_inference
        status = init_inference()
        return jsonify({'ok': True, 'artifacts': status})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

if __name__ == '__main__':
    # eager load model/artifacts at startup (best-effort)
    try:
        from openmeteo_inference import init_inference
        init_inference()
    except Exception:
        pass
    app.run(debug=True)

@app.route('/predict', methods=['POST', 'GET'])
def predict_endpoint():
    """Predict route between two points given source and destination with lat and lon.

    Expectation:
    - POST with JSON: {"source": {"lat": .., "lon": ..}, "destination": {"lat": .., "lon": ..}}
    - GET returns usage instructions for quick browser testing.
    """
    example_payload = {
        "source": {"lat": 38.9, "lon": -77.0},
        "destination": {"lat": 38.95, "lon": -77.02}
    }
    info = "This endpoint expects a POST with JSON body."
    note = (
        "Use POST to receive a prediction. Example: curl -X POST -H 'Content-Type: application/json' "
        "-d '{\"source\": {\"lat\": 38.9, \"lon\": -77.0}, \"destination\": {\"lat\": 38.95, \"lon\": -77.02}}' "
        "http://127.0.0.1:5000/predict"
    )

    if request.method == 'GET':
        # Return the same structure as POST but without prediction
        # response_payload = {
        #     "index": None,
        #     "prediction": {},
        #     "called_with": "GET",
        #     "diagnostics": {},
        #     "example": example_payload,
        #     "info": info,
        #     "note": note
        # }

        # For GET request, compute the road risk index using the example coordinates
        src_lat = example_payload['source']['lat']
        src_lon = example_payload['source']['lon']
        dst_lat = example_payload['destination']['lat']
        dst_lon = example_payload['destination']['lon']
        
        # Use the compute_index function to get the road risk index
        index = compute_index(src_lat, src_lon)

        # Prepare the response payload
        response_payload = {
            "index": index,  # The computed index here
            "prediction": {},
            "called_with": "GET",
            "diagnostics": {},
            "example": example_payload,
            "info": info,
            "note": note
        }
        return jsonify(response_payload), 200

    # POST request logic
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
        from openmeteo_client import compute_reroute
    except Exception as e:
        return jsonify({
            "error": "compute_reroute not found in openmeteo_client",
            "detail": str(e),
            "hint": "Provide openmeteo_client.compute_reroute "
                    "(Open-Meteo does not need an API key)"
        }), 500

    if not callable(compute_reroute):
        return jsonify({"error": "openmeteo_client.compute_reroute is not callable"}), 500

    def _extract_index(res):
        if res is None:
            return None
        if isinstance(res, (int, float)):
            return int(res)
        if isinstance(res, dict):
            for k in ('index', 'idx', 'cluster', 'cluster_idx', 'label_index', 'label_idx'):
                if k in res:
                    try:
                        return int(res[k])
                    except Exception:
                        return res[k]
        return None

    # Call compute_reroute (Open-Meteo requires no API key)
    try:
        result = compute_reroute(src_lat, src_lon, dst_lat, dst_lon)
        called_with = "positional"

        diagnostics = {"type": type(result).__name__}
        try:
            diagnostics["repr"] = repr(result)[:1000]
        except Exception:
            diagnostics["repr"] = "<unrepr-able>"

        # Normalize return types
        if isinstance(result, (list, tuple)):
            idx = None
            for el in result:
                idx = _extract_index(el)
                if idx is not None:
                    break
            prediction = {"items": list(result)}
            index = idx
        elif isinstance(result, dict):
            index = _extract_index(result)
            prediction = result
        elif isinstance(result, (int, float, str)):
            index = _extract_index(result)
            prediction = {"value": result}
        else:
            index = None
            prediction = {"value": result}

        response_payload = {
            "index": index,
            "prediction": prediction,
            "called_with": called_with,
            "diagnostics": diagnostics,
            "example": example_payload,
            "info": info,
            "note": note
        }

        # Add warning if no routing/index info found
        expected_keys = ('route', 'path', 'distance', 'directions', 'index', 'idx', 'cluster')
        if (not isinstance(prediction, dict) or not any(k in prediction for k in expected_keys)) and index is None:
            response_payload["warning"] = (
                "No routing/index information returned from compute_reroute. "
                "See diagnostics for details."
            )

        return jsonify(response_payload), 200

    except Exception as e:
        return jsonify({
            "error": "Error processing the request",
            "detail": str(e)
        }), 500

    except Exception as e:
        return jsonify({"error": "compute_reroute invocation failed", "detail": str(e)}), 500