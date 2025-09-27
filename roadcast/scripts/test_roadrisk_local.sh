#!/usr/bin/env bash
# Run from repo root. Make sure your Flask app is running (python app.py) first.
# Export your OpenWeather key (do NOT commit it into code):
#   export OPENWEATHER_API_KEY="your_real_key_here"

HOST=${HOST:-http://127.0.0.1:5000}

echo "Test 1: env var key (no explicit api_key in payload)"
curl -s -X POST ${HOST}/predict-roadrisk -H "Content-Type: application/json" -d '{"lat":38.9,"lon":-77.0}' | jq

echo "Test 2: explicit api_key in payload (overrides env var)"
curl -s -X POST ${HOST}/predict-roadrisk -H "Content-Type: application/json" -d '{"lat":38.9,"lon":-77.0,"api_key":"MY_OVERRIDE_KEY"}' | jq
