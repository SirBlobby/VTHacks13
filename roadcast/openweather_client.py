"""OpenWeather / Road Risk client.

Provides:
- fetch_weather(lat, lon, api_key=None)
- fetch_road_risk(lat, lon, api_key=None, roadrisk_url=None, extra_params=None)

Never hardcode API keys in source. Provide via api_key argument or set OPENWEATHER_API_KEY / OPENWEATHER_KEY env var.
"""
import os
from typing import Tuple, Dict, Any, Optional, Callable, List
import requests
import heapq
import math

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
    Uses equal-width bins: 0..(max_risk/num_bins) -> 1, ..., >=max_risk -> num_bins.
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
    """
    Wrapper: calls fetch_road_risk and returns features['road_risk_score'] (float).
    Pass api_key/roadrisk_url via fetch_kwargs as needed.
    """
    _, features = fetch_road_risk(lat, lon, **fetch_kwargs)
    return float(features.get("road_risk_score", 0.0))


def compute_reroute(start_lat: float,
                    start_lon: float,
                    risk_provider: Callable[[float, float], float] = None,
                    lat_range: float = 0.005,
                    lon_range: float = 0.01,
                    n_lat: int = 7,
                    n_lon: int = 7,
                    max_calls: Optional[int] = None,
                    distance_weight: float = 0.1) -> Dict[str, Any]:
    """
    Sample a grid around (start_lat, start_lon), get risk at each grid node via risk_provider,
    find the node with minimum risk, and run Dijkstra on the grid (4-neighbors) where edge cost =
    average node risk + distance_weight * distance_km. Returns path and stats.

    Defaults: n_lat/n_lon small to limit API calls. max_calls optionally caps number of risk_provider calls.
    """
    if risk_provider is None:
        # default risk provider that calls fetch_road_risk (may require API key in env or fetch_kwargs)
        def _rp(lat, lon): return get_risk_score(lat, lon)
        risk_provider = _rp

    # build grid coordinates
    lat_steps = n_lat
    lon_steps = n_lon
    if lat_steps < 2 or lon_steps < 2:
        raise ValueError("n_lat and n_lon must be >= 2")
    lat0 = start_lat - lat_range
    lon0 = start_lon - lon_range
    lat_step = (2 * lat_range) / (lat_steps - 1)
    lon_step = (2 * lon_range) / (lon_steps - 1)

    coords: List[Tuple[float, float]] = []
    for i in range(lat_steps):
        for j in range(lon_steps):
            coords.append((lat0 + i * lat_step, lon0 + j * lon_step))

    # sample risks with caching and optional call limit
    risks: List[float] = []
    calls = 0
    for (lat, lon) in coords:
        if max_calls is not None and calls >= max_calls:
            # conservative fallback: assume same as start risk if call limit reached
            risks.append(float('inf'))
            continue
        try:
            r = float(risk_provider(lat, lon))
        except Exception:
            r = float('inf')
        risks.append(r)
        calls += 1

    # convert to grid indexed by (i,j)
    def idx(i, j): return i * lon_steps + j
    # find start index (closest grid node to start)
    start_i = round((start_lat - lat0) / lat_step)
    start_j = round((start_lon - lon0) / lon_step)
    start_i = max(0, min(lat_steps - 1, start_i))
    start_j = max(0, min(lon_steps - 1, start_j))
    start_index = idx(start_i, start_j)

    # find target node = min risk node (ignore inf)
    min_risk = min(risks)
    if math.isinf(min_risk) or min_risk >= risks[start_index]:
        # no better location found or sampling failed
        return {
            "reroute_needed": False,
            "reason": "no_lower_risk_found",
            "start_coord": (start_lat, start_lon),
            "start_risk": None if math.isinf(risks[start_index]) else risks[start_index],
        }

    target_index = int(risks.index(min_risk))

    # Dijkstra from start_index to target_index
    N = len(coords)
    dist = [math.inf] * N
    prev = [None] * N
    dist[start_index] = 0.0
    pq = [(0.0, start_index)]
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u]:
            continue
        if u == target_index:
            break
        ui = u // lon_steps
        uj = u % lon_steps
        for di, dj in ((1,0),(-1,0),(0,1),(0,-1)):
            vi, vj = ui + di, uj + dj
            if 0 <= vi < lat_steps and 0 <= vj < lon_steps:
                v = idx(vi, vj)
                # cost: average node risk + small distance penalty
                ru = risks[u]
                rv = risks[v]
                if math.isinf(ru) or math.isinf(rv):
                    continue
                lat_u, lon_u = coords[u]
                lat_v, lon_v = coords[v]
                d_km = _haversine_km(lat_u, lon_u, lat_v, lon_v)
                w = (ru + rv) / 2.0 + distance_weight * d_km
                nd = d + w
                if nd < dist[v]:
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(pq, (nd, v))

    if math.isinf(dist[target_index]):
        return {
            "reroute_needed": False,
            "reason": "no_path_found",
            "start_coord": (start_lat, start_lon),
            "start_risk": risks[start_index],
            "target_risk": risks[target_index],
        }

    # reconstruct path
    path_indices = []
    cur = target_index
    while cur is not None:
        path_indices.append(cur)
        cur = prev[cur]
    path_indices.reverse()
    path_coords = [coords[k] for k in path_indices]
    start_risk = risks[start_index]
    end_risk = risks[target_index]
    improvement = (start_risk - end_risk) if start_risk not in (None, float('inf')) else None

    return {
        "reroute_needed": True,
        "start_coord": (start_lat, start_lon),
        "start_risk": start_risk,
        "target_coord": coords[target_index],
        "target_risk": end_risk,
        "path": path_coords,
        "path_cost": dist[target_index],
        "risk_improvement": improvement,
        "grid_shape": (lat_steps, lon_steps),
        "calls_made": calls,
    }


def compute_index_and_reroute(lat: float,
                              lon: float,
                              api_key: Optional[str] = None,
                              roadrisk_url: Optional[str] = None,
                              max_risk: float = 10.0,
                              num_bins: int = 10,
                              reroute_kwargs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    High-level convenience: get road risk, map to index (1..num_bins), and attempt reroute.
    reroute_kwargs are forwarded to compute_reroute (risk_provider will call fetch_road_risk
    using provided api_key/roadrisk_url).
    """
    if reroute_kwargs is None:
        reroute_kwargs = {}

    # obtain base risk
    data, features = fetch_road_risk(lat, lon, api_key=api_key, roadrisk_url=roadrisk_url)
    road_risk = float(features.get("road_risk_score", 0.0))

    # compute index: if 'accidents' present in features, prefer that mapping
    accidents = features.get("accidents") or features.get("accident_count")
    try:
        if accidents is not None:
            # map raw accident count to index 1..num_bins
            from .models import accidents_to_bucket
            idx = accidents_to_bucket(int(accidents), max_count=20000, num_bins=num_bins)
        else:
            idx = risk_to_index(road_risk, max_risk=max_risk, num_bins=num_bins)
    except Exception:
        idx = risk_to_index(road_risk, max_risk=max_risk, num_bins=num_bins)

    # prepare risk_provider that passes api_key/roadrisk_url through
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
