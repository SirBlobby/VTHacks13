"""Open-Meteo historical weather client + simple road-risk heuristics.

Backwards-compatible API:
- fetch_weather(lat, lon, params=None, api_key=None)
- fetch_road_risk(lat, lon, extra_params=None, api_key=None, roadrisk_url=None)
- get_risk_score(lat, lon, **fetch_kwargs)
- compute_reroute(...)
- compute_index_and_reroute(...)
"""
import os
from typing import Tuple, Dict, Any, Optional, Callable, List
import requests
import heapq
import math
from datetime import date, timedelta

# Open-Meteo archive endpoint (no API key required)
BASE_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


def fetch_weather(lat: float, lon: float, params: Optional[dict] = None, api_key: Optional[str] = None) -> dict:
	"""Fetch historical weather from Open-Meteo archive API.

	Params may include 'start_date', 'end_date' (YYYY-MM-DD) and 'hourly' (comma-separated vars).
	Defaults to yesterday..today and hourly variables useful for road risk.
	(api_key parameter is accepted for compatibility but ignored.)
	"""
	if params is None:
		params = {}

	today = date.today()
	start = params.get("start_date", (today - timedelta(days=1)).isoformat())
	end = params.get("end_date", today.isoformat())

	hourly = params.get(
		"hourly",
		",".join(["temperature_2m", "relativehumidity_2m", "windspeed_10m", "precipitation", "weathercode"])
	)

	query = {
		"latitude": lat,
		"longitude": lon,
		"start_date": start,
		"end_date": end,
		"hourly": hourly,
		"timezone": params.get("timezone", "UTC"),
	}

	resp = requests.get(BASE_ARCHIVE_URL, params=query, timeout=15)
	resp.raise_for_status()
	return resp.json()


def fetch_road_risk(
	lat: float,
	lon: float,
	extra_params: Optional[dict] = None,
	api_key: Optional[str] = None,
	roadrisk_url: Optional[str] = None
) -> Tuple[dict, Dict[str, Any]]:
	"""
	Compute a simple road risk estimation using Open-Meteo historical weather.

	Returns (raw_data, features) where features includes 'road_risk_score' (float).
	api_key and roadrisk_url are accepted for backward compatibility but ignored.
	"""
	params = {}
	if extra_params:
		params.update(extra_params)

	# fetch weather via Open-Meteo archive
	try:
		data = fetch_weather(lat, lon, params=params)
	except Exception as e:
		features: Dict[str, Any] = {"road_risk_score": 0.0, "error": str(e)}
		return {}, features

	hourly = data.get("hourly", {}) if isinstance(data, dict) else {}

	def _arr_mean(key):
		arr = hourly.get(key)
		if isinstance(arr, list) and arr:
			valid = [float(x) for x in arr if x is not None]
			return sum(valid) / max(1, len(valid)) if valid else None
		return None

	def _arr_max(key):
		arr = hourly.get(key)
		if isinstance(arr, list) and arr:
			valid = [float(x) for x in arr if x is not None]
			return max(valid) if valid else None
		return None

	precip_mean = _arr_mean("precipitation")
	wind_mean = _arr_mean("windspeed_10m")
	wind_max = _arr_max("windspeed_10m")
	temp_mean = _arr_mean("temperature_2m")
	humidity_mean = _arr_mean("relativehumidity_2m")
	weathercodes = hourly.get("weathercode", [])

	# heuristic risk scoring:
	risk = 0.0
	if precip_mean is not None:
		risk += float(precip_mean) * 2.0
	if wind_mean is not None:
		risk += float(wind_mean) * 0.1
	if wind_max is not None and float(wind_max) > 15.0:
		risk += 1.0
	if humidity_mean is not None and float(humidity_mean) > 85.0:
		risk += 0.5
	try:
		# sample Open-Meteo weather codes that indicate precipitation/snow
		if any(int(wc) in (51, 61, 63, 65, 80, 81, 82, 71, 73, 75, 85, 86) for wc in weathercodes if wc is not None):
			risk += 1.0
	except Exception:
		pass

	if not math.isfinite(risk):
		risk = 0.0
	if risk < 0:
		risk = 0.0

	features: Dict[str, Any] = {
		"precipitation_mean": float(precip_mean) if precip_mean is not None else None,
		"wind_mean": float(wind_mean) if wind_mean is not None else None,
		"wind_max": float(wind_max) if wind_max is not None else None,
		"temp_mean": float(temp_mean) if temp_mean is not None else None,
		"humidity_mean": float(humidity_mean) if humidity_mean is not None else None,
		"road_risk_score": float(risk),
	}

	# include some raw metadata if present
	if "latitude" in data:
		features["latitude"] = data.get("latitude")
	if "longitude" in data:
		features["longitude"] = data.get("longitude")
	if "generationtime_ms" in data:
		features["generationtime_ms"] = data.get("generationtime_ms")

	return data, features


def _haversine_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
	# returns distance in kilometers
	R = 6371.0
	lat1, lon1, lat2, lon2 = map(math.radians, (a_lat, a_lon, b_lat, b_lon))
	dlat = lat2 - lat1
	dlon = lon2 - lon1
	h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
	return 2 * R * math.asin(min(1.0, math.sqrt(h)))


def risk_to_index(risk_score: float, max_risk: float = 10.0, num_bins: int = 10) -> int:
	"""
	Map a numeric risk_score to an integer index 1..num_bins (higher => more risky).
	"""
	if risk_score is None:
		return 1
	r = float(risk_score)
	if r <= 0:
		return 1
	if r >= max_risk:
		return num_bins
	bin_width = max_risk / float(num_bins)
	return int(r // bin_width) + 1


def get_risk_score(lat: float, lon: float, **fetch_kwargs) -> float:
	"""Wrapper: calls fetch_road_risk and returns features['road_risk_score'] (float)."""
	_, features = fetch_road_risk(lat, lon, extra_params=fetch_kwargs)
	return float(features.get("road_risk_score", 0.0))


def compute_reroute(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    risk_provider: Callable[[float, float], float] = None,
    n_lat: int = 20,
    n_lon: int = 20,
    distance_weight: float = 0.1,
    max_calls: Optional[int] = None
) -> Dict[str, Any]:
	"""
	Plan a path from (start_lat, start_lon) to (end_lat, end_lon) that avoids risky areas.
	Uses Dijkstra's algorithm over a lat/lon grid with cost = avg risk + distance_weight * distance.
	"""
	if risk_provider is None:
		risk_provider = lambda lat, lon: get_risk_score(lat, lon)

	min_lat = min(start_lat, end_lat)
	max_lat = max(start_lat, end_lat)
	min_lon = min(start_lon, end_lon)
	max_lon = max(start_lon, end_lon)

	lat_padding = (max_lat - min_lat) * 0.2
	lon_padding = (max_lon - min_lon) * 0.2
	min_lat -= lat_padding
	max_lat += lat_padding
	min_lon -= lon_padding
	max_lon += lon_padding

	lat_step = (max_lat - min_lat) / (n_lat - 1) if n_lat > 1 else 0.0
	lon_step = (max_lon - min_lon) / (n_lon - 1) if n_lon > 1 else 0.0

	coords = []
	for i in range(n_lat):
		for j in range(n_lon):
			coords.append((min_lat + i * lat_step, min_lon + j * lon_step))

	risks = []
	calls = 0
	for lat, lon in coords:
		if max_calls is not None and calls >= max_calls:
			risks.append(float('inf'))
			continue
		try:
			risk = risk_provider(lat, lon)
		except Exception:
			risk = float('inf')
		risks.append(float(risk))
		calls += 1

	def idx(i, j):
		return i * n_lon + j

	def find_closest(lat, lon):
		i = round((lat - min_lat) / (lat_step if lat_step != 0 else 1e-9))
		j = round((lon - min_lon) / (lon_step if lon_step != 0 else 1e-9))
		i = max(0, min(n_lat - 1, i))
		j = max(0, min(n_lon - 1, j))
		return idx(i, j)

	start_idx = find_closest(start_lat, start_lon)
	end_idx = find_closest(end_lat, end_lon)

	N = len(coords)
	dist = [math.inf] * N
	prev = [None] * N
	dist[start_idx] = 0.0
	pq = [(0.0, start_idx)]

	while pq:
		cost, u = heapq.heappop(pq)
		if cost > dist[u]:
			continue
		if u == end_idx:
			break

		ui, uj = u // n_lon, u % n_lon
		for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
			vi, vj = ui + di, uj + dj
			if 0 <= vi < n_lat and 0 <= vj < n_lon:
				v = idx(vi, vj)
				if math.isinf(risks[v]) or math.isinf(risks[u]):
					continue
				lat_u, lon_u = coords[u]
				lat_v, lon_v = coords[v]
				d_km = _haversine_km(lat_u, lon_u, lat_v, lon_v)
				edge_cost = (risks[u] + risks[v]) / 2 + distance_weight * d_km
				new_cost = cost + edge_cost
				if new_cost < dist[v]:
					dist[v] = new_cost
					prev[v] = u
					heapq.heappush(pq, (new_cost, v))

	if math.isinf(dist[end_idx]):
		return {
			"reroute_needed": False,
			"reason": "no_path_found",
			"start_coord": (start_lat, start_lon),
			"end_coord": (end_lat, end_lon),
			"calls_made": calls
		}

	path_indices = []
	u = end_idx
	while u is not None:
		path_indices.append(u)
		u = prev[u]
	path_indices.reverse()

	path_coords = [coords[i] for i in path_indices]
	return {
		"reroute_needed": True,
		"start_coord": (start_lat, start_lon),
		"end_coord": (end_lat, end_lon),
		"path": path_coords,
		"total_cost": dist[end_idx],
		"start_risk": risks[start_idx],
		"end_risk": risks[end_idx],
		"calls_made": calls,
		"grid_shape": (n_lat, n_lon)
	}


def compute_index_and_reroute(lat: float,
                              lon: float,
                              api_key: Optional[str] = None,
                              roadrisk_url: Optional[str] = None,
                              max_risk: float = 10.0,
                              num_bins: int = 10,
                              reroute_kwargs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
	"""
	Get road risk, map to index (1..num_bins), and attempt reroute.
	reroute_kwargs forwarded to compute_reroute.
	api_key/roadrisk_url accepted for compatibility but ignored by Open-Meteo implementation.
	"""
	if reroute_kwargs is None:
		reroute_kwargs = {}

	data, features = fetch_road_risk(lat, lon, extra_params=reroute_kwargs, api_key=api_key, roadrisk_url=roadrisk_url)
	road_risk = float(features.get("road_risk_score", 0.0))

	accidents = features.get("accidents") or features.get("accident_count")
	try:
		if accidents is not None:
			# fallback: map accident count to index if present
			from .models import accidents_to_bucket  # may not exist; wrapped in try
			idx = accidents_to_bucket(int(accidents), max_count=20000, num_bins=num_bins)
		else:
			idx = risk_to_index(road_risk, max_risk=max_risk, num_bins=num_bins)
	except Exception:
		idx = risk_to_index(road_risk, max_risk=max_risk, num_bins=num_bins)

	def _rp(lat_, lon_):
		return get_risk_score(lat_, lon_, api_key=api_key, roadrisk_url=roadrisk_url)

	reroute_info = compute_reroute(lat, lon, risk_provider=_rp, **reroute_kwargs)
	return {
		"lat": lat,
		"lon": lon,
		"index": int(idx),
		"road_risk_score": road_risk,
		"features": features,
		"reroute": reroute_info,
		"raw_roadrisk_response": data,
	}
