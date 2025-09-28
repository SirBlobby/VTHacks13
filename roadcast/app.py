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
        return jsonify({"info": info, "example": example_payload, "note": note}), 200


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


        return jsonify(response_payload)


    except Exception as e:
        return jsonify({"error": "compute_reroute invocation failed", "detail": str(e)}), 500