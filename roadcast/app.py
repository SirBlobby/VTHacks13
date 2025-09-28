from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from train import compute_index
from models import load_model
from models import MLP

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
# Enable CORS for all routes, origins, and methods
CORS(app, resources={
    r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"]
    }
})
import os
import threading
import json
import numpy as np  # added

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

@app.route('/predict', methods=['POST', 'GET'])
def predict_endpoint():
    """Predict route between two points given source and destination with lat and lon.
    GET uses an example payload; POST accepts JSON with 'source' and 'destination'.
    Both methods run the same model/index logic and return the same response format.
    """
    example_payload = {
        "source": {"lat": 38.9, "lon": -77.0},
        "destination": {"lat": 38.95, "lon": -77.02}
    }

    info = "This endpoint expects a POST with JSON body (GET returns example payload)."
    note = (
        "Use POST to receive a prediction. Example: curl -X POST -H 'Content-Type: application/json' "
        "-d '{\"source\": {\"lat\": 38.9, \"lon\": -77.0}, \"destination\": {\"lat\": 38.95, \"lon\": -77.02}}' "
        "http://127.0.0.1:5000/predict"
    )

    # unify request data: GET -> example, POST -> request.json
    if request.method == 'GET':
        data = example_payload
    else:
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

    # load model (loader infers architecture from checkpoint)
    try:
        model = load_model('model.pth', MLP)
    except Exception as e:
        return jsonify({"error": "model load failed", "detail": str(e)}), 500

    # infer expected input dim from model first linear weight
    try:
        input_dim = None
        for v in model.state_dict().values():
            if getattr(v, "dim", None) and v.dim() == 2:
                input_dim = int(v.shape[1])
                break
        if input_dim is None:
            input_dim = 2
    except Exception:
        input_dim = 2

    # build feature vector of correct length and populate lat/lon using preprocess meta if available
    feature_vector = np.zeros(int(input_dim), dtype=float)
    meta_path = os.path.join(os.getcwd(), 'preprocess_meta.npz')
    
    if os.path.exists(meta_path):
        try:
            meta = np.load(meta_path, allow_pickle=True)
            cols = [str(x) for x in meta['feature_columns'].tolist()]
            means = meta.get('means')
            if means is not None and len(means) == input_dim:
                feature_vector[:] = means
                
            col_lower = [c.lower() for c in cols]
            print(f"📋 Available columns: {col_lower[:10]}...")  # Show first 10 columns
            
            # Try to find and populate coordinate fields
            coord_mappings = [
                (('lat', 'latitude', 'src_lat', 'source_lat'), src_lat),
                (('lon', 'lng', 'longitude', 'src_lon', 'source_lon'), src_lon),
                (('dst_lat', 'dest_lat', 'destination_lat', 'end_lat'), dst_lat),
                (('dst_lon', 'dest_lon', 'destination_lon', 'end_lon', 'dst_lng'), dst_lon)
            ]
            
            for possible_names, value in coord_mappings:
                for name in possible_names:
                    if name in col_lower:
                        idx = col_lower.index(name)
                        feature_vector[idx] = value
                        print(f"✅ Mapped {name} (index {idx}) = {value}")
                        break
                        
            # Calculate route features that might be useful
            route_distance = ((dst_lat - src_lat)**2 + (dst_lon - src_lon)**2)**0.5
            midpoint_lat = (src_lat + dst_lat) / 2
            midpoint_lon = (src_lon + dst_lon) / 2
            
            # Try to populate additional features that might exist
            additional_features = {
                'distance': route_distance,
                'route_distance': route_distance,
                'midpoint_lat': midpoint_lat,
                'midpoint_lon': midpoint_lon,
                'lat_diff': abs(dst_lat - src_lat),
                'lon_diff': abs(dst_lon - src_lon)
            }
            
            for feature_name, feature_value in additional_features.items():
                if feature_name in col_lower:
                    idx = col_lower.index(feature_name)
                    feature_vector[idx] = feature_value
                    print(f"✅ Mapped {feature_name} (index {idx}) = {feature_value}")
                    
        except Exception as e:
            print(f"⚠️ Error processing metadata: {e}")
            # Fallback to simple coordinate mapping
            feature_vector[:] = 0.0
            feature_vector[0] = src_lat
            if input_dim > 1:
                feature_vector[1] = src_lon
            if input_dim > 2:
                feature_vector[2] = dst_lat
            if input_dim > 3:
                feature_vector[3] = dst_lon
    else:
        print("⚠️ No preprocess_meta.npz found, using simple coordinate mapping")
        # Simple fallback mapping
        feature_vector[0] = src_lat
        if input_dim > 1:
            feature_vector[1] = src_lon
        if input_dim > 2:
            feature_vector[2] = dst_lat
        if input_dim > 3:
            feature_vector[3] = dst_lon
        
        # Add some derived features to create more variation
        if input_dim > 4:
            feature_vector[4] = ((dst_lat - src_lat)**2 + (dst_lon - src_lon)**2)**0.5  # distance
        if input_dim > 5:
            feature_vector[5] = (src_lat + dst_lat) / 2  # midpoint lat
        if input_dim > 6:
            feature_vector[6] = (src_lon + dst_lon) / 2  # midpoint lon

    # compute index using model
    try:
        print(f"🔍 Feature vector for prediction: {feature_vector[:8]}...")  # Show first 8 values
        print(f"📍 Coordinates: src({src_lat}, {src_lon}) → dst({dst_lat}, {dst_lon})")
        index = compute_index(model, feature_vector)
        print(f"📊 Computed index: {index}")
    except Exception as e:
        return jsonify({"error": "compute_index failed", "detail": str(e)}), 500

    response_payload = {
        "index": index,
        "prediction": {},
        "called_with": request.method,
        "diagnostics": {"input_dim": int(input_dim)},
        "example": example_payload,
        "info": info,
        "note": note
    }

    return jsonify(response_payload), 200

if __name__ == '__main__':
    # eager load model/artifacts at startup (best-effort)
    try:
        from openmeteo_inference import init_inference
        init_inference()
    except Exception:
        pass
    app.run(debug=True)