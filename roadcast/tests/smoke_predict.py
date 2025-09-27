import sys
import types
import os

# Ensure repo root on path
sys.path.insert(0, r"C:\Users\Samarth Jain\Documents\roadcast")

# Create a fake openweather_inference module with a predictable function
mod = types.ModuleType("openweather_inference")

def predict_from_openweather(lat, lon, dt_iso=None, street='', api_key=None, train_csv=None, preprocess_meta=None, model_path=None, centers_path=None, roadrisk_url=None):
    return {"label": 5, "confidence": 0.87, "lat": lat, "lon": lon, "dt": dt_iso}

mod.predict_from_openweather = predict_from_openweather
sys.modules["openweather_inference"] = mod

# Import the Flask app and use its test client
from app import app

c = app.test_client()
res = c.post("/predict-roadrisk", json={"lat": 38.9, "lon": -77.0})
print("STATUS:", res.status_code)
print("JSON:", res.get_json())
