import json
import pytest
from unittest.mock import patch

def test_predict_roadrisk_forwards_api_key(monkeypatch):
    # import app after monkeypatching env to avoid side effects
    from app import app
    client = app.test_client()

    fake_response = {"road_risk": "ok", "risk_index": 5}

    # patch the inference function to capture args and return a dummy response
    with patch("openweather_inference.predict_from_openweather") as mock_predict:
        mock_predict.return_value = fake_response

        payload = {"lat": 38.9, "lon": -77.0, "api_key": "EXPLICIT_TEST_KEY"}
        rv = client.post("/predict-roadrisk", data=json.dumps(payload), content_type="application/json")
        assert rv.status_code == 200
        data = rv.get_json()
        assert data == fake_response

        # assert that our mocked predict_from_openweather was called and api_key forwarded
        assert mock_predict.called
        _, called_kwargs = mock_predict.call_args
        assert called_kwargs.get("api_key") == "EXPLICIT_TEST_KEY"

def test_predict_roadrisk_uses_env_key_when_not_provided(monkeypatch):
    from app import app
    client = app.test_client()

    fake_response = {"road_risk": "ok", "risk_index": 3}
    monkeypatch.setenv("OPENWEATHER_API_KEY", "ENV_TEST_KEY")

    with patch("openweather_inference.predict_from_openweather") as mock_predict:
        mock_predict.return_value = fake_response

        payload = {"lat": 38.9, "lon": -77.0}  # no api_key in payload
        rv = client.post("/predict-roadrisk", data=json.dumps(payload), content_type="application/json")
        assert rv.status_code == 200
        data = rv.get_json()
        assert data == fake_response

        assert mock_predict.called
        _, called_kwargs = mock_predict.call_args
        assert called_kwargs.get("api_key") == "ENV_TEST_KEY"
