"""OpenWeather / Road Risk client.

Provides:
- fetch_weather(lat, lon, api_key=None)
- fetch_road_risk(lat, lon, api_key=None, roadrisk_url=None, extra_params=None)

Never hardcode API keys in source. Provide via api_key argument or set OPENWEATHER_API_KEY / OPENWEATHER_KEY env var.
"""
import os
from typing import Tuple, Dict, Any, Optional
import requests

def _get_api_key(explicit_key: Optional[str] = None) -> Optional[str]:
    if explicit_key:
        return explicit_key
    return os.environ.get("OPENWEATHER_API_KEY") or os.environ.get("OPENWEATHER_KEY")

BASE_URL = "https://api.openweathermap.org/data/2.5"


def fetch_weather(lat: float, lon: float, params: Optional[dict] = None, api_key: Optional[str] = None) -> dict:
    """Call standard OpenWeather /weather endpoint and return parsed JSON."""
    key = _get_api_key(api_key)
    if key is None:
        raise RuntimeError("Set OPENWEATHER_API_KEY or OPENWEATHER_KEY or pass api_key")
    q = {"lat": lat, "lon": lon, "appid": key, "units": "metric"}
    if params:
        q.update(params)
    resp = requests.get(f"{BASE_URL}/weather", params=q, timeout=10)
    resp.raise_for_status()
    return resp.json()


def fetch_road_risk(lat: float, lon: float, extra_params: Optional[dict] = None, api_key: Optional[str] = None, roadrisk_url: Optional[str] = None) -> Tuple[dict, Dict[str, Any]]:
    """
    Call OpenWeather /roadrisk endpoint (or provided roadrisk_url) and return (raw_json, features).

    features will always include 'road_risk_score' (float). Other numeric fields are included when present.
    The implementation:
      - prefers explicit numeric keys (road_risk_score, risk_score, score, risk)
      - if absent, collects top-level numeric fields and averages common contributors
      - if still absent, falls back to a simple weather-derived heuristic using /weather

    Note: Do not commit API keys. Pass api_key or set env var.
    """
    key = _get_api_key(api_key)
    if key is None:
        raise RuntimeError("Set OPENWEATHER_API_KEY or OPENWEATHER_KEY or pass api_key")

    params = {"lat": lat, "lon": lon, "appid": key}
    if extra_params:
        params.update(extra_params)

    url = roadrisk_url or f"{BASE_URL}/roadrisk"
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    features: Dict[str, Any] = {}
    risk: Optional[float] = None

    # direct candidates
    for candidate in ("road_risk_score", "risk_score", "risk", "score"):
        if isinstance(data, dict) and candidate in data:
            try:
                risk = float(data[candidate])
                features[candidate] = risk
                break
            except Exception:
                pass

    # if no direct candidate, collect numeric top-level fields
    if risk is None and isinstance(data, dict):
        numeric_fields = {}
        for k, v in data.items():
            if isinstance(v, (int, float)):
                numeric_fields[k] = float(v)
        features.update(numeric_fields)
        # try averaging common contributors if present
        contributors = []
        for name in ("precipitation", "rain", "snow", "visibility", "wind_speed"):
            if name in data and isinstance(data[name], (int, float)):
                contributors.append(float(data[name]))
        if contributors:
            # average contributors -> risk proxy
            risk = float(sum(contributors) / len(contributors))

    # fallback: derive crude risk from /weather
    if risk is None:
        try:
            w = fetch_weather(lat, lon, api_key=key)
            main = w.get("main", {})
            wind = w.get("wind", {})
            weather = w.get("weather", [{}])[0]
            # heuristic: rain + high wind + low visibility
            derived = 0.0
            if isinstance(weather.get("main", ""), str) and "rain" in weather.get("main", "").lower():
                derived += 1.0
            if (wind.get("speed") or 0) > 6.0:
                derived += 0.5
            if (w.get("visibility") or 10000) < 5000:
                derived += 1.0
            risk = float(derived)
            features.update({
                "temp": main.get("temp"),
                "humidity": main.get("humidity"),
                "wind_speed": wind.get("speed"),
                "visibility": w.get("visibility"),
                "weather_main": weather.get("main"),
                "weather_id": weather.get("id"),
            })
        except Exception:
            # cannot derive anything; set neutral 0.0
            risk = 0.0

    features["road_risk_score"] = float(risk)
    return data, features
