from flask import Flask, request, jsonify

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


@app.route('/predict', methods=['POST'])
def predict_endpoint():
    """Predict single uploaded image. Expects form-data with file field named 'image'."""
    if 'image' not in request.files:
        return jsonify({"error": "no image uploaded (field 'image')"}), 400
    img = request.files['image']
    tmp_path = os.path.join(os.getcwd(), 'tmp_upload.jpg')
    img.save(tmp_path)
    try:
        from inference import load_model, predict_image
        model_path = os.path.join(os.getcwd(), 'model.pth')
        if not os.path.exists(model_path):
            return jsonify({"error": "no trained model found (run /train first)"}), 400
        model, idx_to_class = load_model(model_path)
        idx, conf = predict_image(model, tmp_path)
        label = idx_to_class.get(idx) if idx_to_class else str(idx)
        return jsonify({"label": label, "confidence": conf})
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


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
    api_key = payload.get('api_key') or os.environ.get('OPENWEATHER_KEY')

    if lat is None or lon is None:
        return jsonify({"error": "lat and lon are required fields"}), 400

    try:
        from openweather_inference import predict_from_openweather
        res = predict_from_openweather(lat, lon, dt_iso=dt, street=street, api_key=api_key, train_csv=os.path.join(os.getcwd(), 'data.csv'), preprocess_meta=None, model_path=os.path.join(os.getcwd(), 'model.pth'), centers_path=os.path.join(os.getcwd(), 'kmeans_centers_all.npz'), roadrisk_url=roadrisk_url)
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
