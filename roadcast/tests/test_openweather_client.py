import os
import builtins
import pytest
from unittest.mock import patch, MagicMock

from openweather_client import fetch_road_risk, fetch_weather, _get_api_key

class DummyResp:
    def __init__(self, json_data, status=200):
        self._json = json_data
        self.status = status
    def raise_for_status(self):
        if self.status >= 400:
            raise Exception("HTTP error")
    def json(self):
        return self._json

def make_get(mock_json, status=200):
    return MagicMock(return_value=DummyResp(mock_json, status=status))

def test_get_api_key_prefers_explicit(monkeypatch):
    # explicit key should be returned
    assert _get_api_key("EXPLICIT") == "EXPLICIT"
    monkeypatch.delenv("OPENWEATHER_API_KEY", raising=False)
    monkeypatch.delenv("OPENWEATHER_KEY", raising=False)
    assert _get_api_key(None) is None

def test_fetch_road_risk_direct_score(monkeypatch):
    # roadrisk returns direct numeric field
    resp_json = {"road_risk_score": 2.5, "detail": "ok"}
    with patch("openweather_client.requests.get", make_get(resp_json)):
        data, features = fetch_road_risk(1.0, 2.0, api_key="TESTKEY")
    assert data["road_risk_score"] == 2.5
    assert features["road_risk_score"] == 2.5

def test_fetch_road_risk_numeric_fields(monkeypatch):
    # roadrisk returns top-level numeric fields, expect average of contributors
    resp_json = {"precipitation": 4.0, "visibility": 2000, "other": 3}
    with patch("openweather_client.requests.get", make_get(resp_json)):
        data, features = fetch_road_risk(1.0, 2.0, api_key="TESTKEY")
    # contributors list contains precipitation and visibility and maybe others; check road_risk_score numeric
    assert "road_risk_score" in features
    assert features["road_risk_score"] > 0

def test_fetch_road_risk_fallback_to_weather(monkeypatch):
    # roadrisk returns empty dict; requests.get called first for roadrisk then for weather.
    seq = [
        DummyResp({}, status=200),  # roadrisk empty
        DummyResp({
            "main": {"temp": 10, "humidity": 80},
            "wind": {"speed": 7.5},
            "visibility": 3000,
            "weather": [{"main": "Rain"}]
        }, status=200)
    ]
    # iterate returns next DummyResp
    def side_effect(url, params=None, timeout=None):
        return seq.pop(0)
    with patch("openweather_client.requests.get", side_effect=side_effect):
        data, features = fetch_road_risk(1.0, 2.0, api_key="TESTKEY")
    # derived heuristic: rain=1.0 + wind>6 => 0.5 + visibility<5000 =>1.0 => total 2.5
    assert abs(features["road_risk_score"] - 2.5) < 1e-6
    assert features["weather_main"] == "Rain" or features.get("weather_main") == "Rain"

def test_fetch_road_risk_missing_api_key(monkeypatch):
    # ensure no env var present
    monkeypatch.delenv("OPENWEATHER_API_KEY", raising=False)
    monkeypatch.delenv("OPENWEATHER_KEY", raising=False)
    with pytest.raises(RuntimeError):
        fetch_road_risk(1.0, 2.0)
