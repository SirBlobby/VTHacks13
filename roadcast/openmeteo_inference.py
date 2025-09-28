"""
Fetch OpenWeather data for a coordinate/time and run the trained MLP to predict the k-means cluster label.

Usage examples:
  # with training CSV provided to compute preprocessing stats:
  python openweather_inference.py --lat 38.9 --lon -77.0 --datetime "2025-09-27T12:00:00" --train-csv data.csv --model model.pth --centers kmeans_centers_all.npz --api-key $OPENWEATHER_KEY

  # with precomputed preprocess meta (saved from training):
  python openweather_inference.py --lat 38.9 --lon -77.0 --datetime "2025-09-27T12:00:00" --preprocess-meta preprocess_meta.npz --model model.pth --centers kmeans_centers_all.npz --api-key $OPENWEATHER_KEY

Notes:
- The script uses the same feature-engineering helpers in `data.py` so the model sees identical inputs.
- You must either provide `--train-csv` (to compute feature columns & means/stds) or `--preprocess-meta` previously saved.
- Provide the OpenWeather API key via --api-key or the OPENWEATHER_KEY environment variable.
"""

import os
import argparse
import json
from datetime import datetime
import numpy as np
import pandas as pd
import torch
import torch.nn.functional as F

# reuse helpers from your repo
from data import _add_date_features, _add_latlon_bins, _add_hashed_street, CSVDataset
from inference import load_model

# module-level caches to avoid reloading heavy artifacts per request
_CACHED_MODEL = None
_CACHED_IDX_TO_CLASS = None
_CACHED_CENTERS = None
_CACHED_PREPROCESS_META = None


OW_BASE = 'https://api.openweathermap.org/data/2.5/onecall'


def fetch_openmeteo(lat, lon, api_key, dt_iso=None):
    """Fetch weather from OpenWeather One Call API for given lat/lon. If dt_iso provided, we fetch current+hourly and pick closest timestamp."""
    try:
        import requests
    except Exception:
        raise RuntimeError('requests library is required to fetch OpenWeather data')
    params = {
        'lat': float(lat),
        'lon': float(lon),
        'appid': api_key,
        'units': 'metric',
        'exclude': 'minutely,alerts'
    }
    r = requests.get(OW_BASE, params=params, timeout=10)
    r.raise_for_status()
    payload = r.json()
    # if dt_iso provided, find nearest hourly data point
    if dt_iso:
        try:
            target = pd.to_datetime(dt_iso)
        except Exception:
            target = None
        best = None
        if 'hourly' in payload and target is not None:
            hours = payload['hourly']
            best = min(hours, key=lambda h: abs(pd.to_datetime(h['dt'], unit='s') - target))
            # convert keys to a flat dict with prefix 'ow_'
            d = {
                'ow_temp': best.get('temp'),
                'ow_feels_like': best.get('feels_like'),
                'ow_pressure': best.get('pressure'),
                'ow_humidity': best.get('humidity'),
                'ow_wind_speed': best.get('wind_speed'),
                'ow_clouds': best.get('clouds'),
                'ow_pop': best.get('pop'),
            }
            return d
    # fallback: use current
    cur = payload.get('current', {})
    d = {
        'ow_temp': cur.get('temp'),
        'ow_feels_like': cur.get('feels_like'),
        'ow_pressure': cur.get('pressure'),
        'ow_humidity': cur.get('humidity'),
        'ow_wind_speed': cur.get('wind_speed'),
        'ow_clouds': cur.get('clouds'),
        'ow_pop': None,
    }
    return d


def fetch_roadrisk(roadrisk_url, api_key=None):
    """Fetch the RoadRisk endpoint (expects JSON). If `api_key` is provided, we'll attach it as a query param if the URL has no key.

    We flatten top-level numeric fields into `rr_*` keys for the feature row.
    """
    # if api_key provided and url does not contain appid, append it
    try:
        import requests
    except Exception:
        raise RuntimeError('requests library is required to fetch RoadRisk data')
    url = roadrisk_url
    if api_key and 'appid=' not in roadrisk_url:
        sep = '&' if '?' in roadrisk_url else '?'
        url = f"{roadrisk_url}{sep}appid={api_key}"

    r = requests.get(url, timeout=10)
    r.raise_for_status()
    payload = r.json()
    # flatten numeric top-level fields
    out = {}
    if isinstance(payload, dict):
        for k, v in payload.items():
            if isinstance(v, (int, float)):
                out[f'rr_{k}'] = v
            # if nested objects contain simple numeric fields, pull them too (one level deep)
            elif isinstance(v, dict):
                for kk, vv in v.items():
                    if isinstance(vv, (int, float)):
                        out[f'rr_{k}_{kk}'] = vv
    return out


def build_row(lat, lon, dt_iso=None, street=None, extra_weather=None):
    """Construct a single-row DataFrame with columns expected by the training pipeline.

    It intentionally uses column names the original `data.py` looked for (REPORTDATE, LATITUDE, LONGITUDE, ADDRESS, etc.).
    """
    row = {}
    # date column matching common names
    row['REPORTDATE'] = dt_iso if dt_iso else datetime.utcnow().isoformat()
    row['LATITUDE'] = lat
    row['LONGITUDE'] = lon
    row['ADDRESS'] = street if street else ''
    # include some injury/fatality placeholders that the label generator expects
    row['INJURIES'] = 0
    row['FATALITIES'] = 0
    # include weather features returned by OpenWeather (prefixed 'ow_')
    if extra_weather:
        for k, v in extra_weather.items():
            row[k] = v
    return pd.DataFrame([row])


def prepare_features(df_row, train_csv=None, preprocess_meta=None, feature_engineer=True, lat_lon_bins=20):
    """Given a one-row DataFrame, apply same feature engineering and standardization as training.

    If preprocess_meta is provided (npz), use it. Otherwise train_csv must be provided to compute stats.
    Returns a torch.FloatTensor of shape (1, input_dim) and the feature_columns list.
    """
    # apply feature engineering helpers
    if feature_engineer:
        try:
            _add_date_features(df_row)
        except Exception:
            pass
        try:
            _add_latlon_bins(df_row, bins=lat_lon_bins)
        except Exception:
            pass
        try:
            _add_hashed_street(df_row)
        except Exception:
            pass

    # if meta provided, load feature_columns, means, stds
    if preprocess_meta and os.path.exists(preprocess_meta):
        meta = np.load(preprocess_meta, allow_pickle=True)
        feature_columns = meta['feature_columns'].tolist()
        means = meta['means']
        stds = meta['stds']
    else:
        if not train_csv:
            raise ValueError('Either preprocess_meta or train_csv must be provided to derive feature stats')
        # instantiate a CSVDataset on train_csv (feature_engineer True) to reuse its preprocessing
        ds = CSVDataset(train_csv, feature_columns=None, label_column='label', generate_labels=True, n_buckets=10, label_method='kmeans', label_store=None, feature_engineer=feature_engineer, lat_lon_bins=lat_lon_bins, nrows=None)
        feature_columns = ds.feature_columns
        means = ds.feature_means
        stds = ds.feature_stds
        # save meta for reuse
        np.savez_compressed('preprocess_meta.npz', feature_columns=np.array(feature_columns, dtype=object), means=means, stds=stds)
        print('Saved preprocess_meta.npz')

    # ensure all feature columns exist in df_row
    for c in feature_columns:
        if c not in df_row.columns:
            df_row[c] = 0

    # coerce and fill using means
    features_df = df_row[feature_columns].apply(lambda c: pd.to_numeric(c, errors='coerce'))
    features_df = features_df.fillna(pd.Series(means, index=feature_columns)).fillna(0.0)
    # standardize
    features_np = (features_df.values - means) / (stds + 1e-6)
    import torch
    return torch.tensor(features_np, dtype=torch.float32), feature_columns


def predict_from_openmeteo(lat, lon, dt_iso=None, street=None, api_key=None, train_csv=None, preprocess_meta=None, model_path='model.pth', centers_path='kmeans_centers_all.npz', roadrisk_url=None):
    api_key = api_key or os.environ.get('OPENWEATHER_KEY')
    if api_key is None:
        raise ValueError('OpenWeather API key required via --api-key or OPENWEATHER_KEY env var')

    # gather weather/road-risk features
    weather = {}
    if roadrisk_url:
        try:
            rr = fetch_roadrisk(roadrisk_url, api_key=api_key)
            weather.update(rr)
        except Exception as e:
            print('Warning: failed to fetch roadrisk URL:', e)
    else:
        try:
            ow = fetch_openmeteo(lat, lon, api_key, dt_iso=dt_iso)
            weather.update(ow)
        except Exception as e:
            print('Warning: failed to fetch openweather:', e)

    df_row = build_row(lat, lon, dt_iso=dt_iso, street=street, extra_weather=weather)
    x_tensor, feature_columns = prepare_features(df_row, train_csv=train_csv, preprocess_meta=preprocess_meta)

    # load model (infer num_classes from centers file if possible)
    global _CACHED_MODEL, _CACHED_IDX_TO_CLASS, _CACHED_CENTERS, _CACHED_PREPROCESS_META

    # ensure we have preprocess_meta available (prefer supplied path, otherwise fallback to saved file)
    if preprocess_meta is None:
        candidate = os.path.join(os.getcwd(), 'preprocess_meta.npz')
        if os.path.exists(candidate):
            preprocess_meta = candidate

    # load centers (cache across requests)
    if _CACHED_CENTERS is None:
        if centers_path and os.path.exists(centers_path):
            try:
                npz = np.load(centers_path)
                _CACHED_CENTERS = npz['centers']
            except Exception:
                _CACHED_CENTERS = None
        else:
            _CACHED_CENTERS = None

    num_classes = _CACHED_CENTERS.shape[0] if _CACHED_CENTERS is not None else 10

    # load model once and cache it
    if _CACHED_MODEL is None:
        try:
            _CACHED_MODEL, _CACHED_IDX_TO_CLASS = load_model(model_path, device=None, in_channels=3, num_classes=num_classes)
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            _CACHED_MODEL.to(device)
        except Exception as e:
            raise
    model = _CACHED_MODEL
    idx_to_class = _CACHED_IDX_TO_CLASS
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    x_tensor = x_tensor.to(device)
    with torch.no_grad():
        logits = model(x_tensor)
        probs = F.softmax(logits, dim=1).cpu().numpy()[0]
        pred_idx = int(probs.argmax())
        confidence = float(probs.max())

    # optionally provide cluster centroid info
    centroid = _CACHED_CENTERS[pred_idx] if _CACHED_CENTERS is not None else None

    return {
        'pred_cluster': int(pred_idx),
        'confidence': confidence,
        'probabilities': probs.tolist(),
        'centroid': centroid.tolist() if centroid is not None else None,
        'feature_columns': feature_columns,
        'used_preprocess_meta': preprocess_meta
    }


def init_inference(model_path='model.pth', centers_path='kmeans_centers_all.npz', preprocess_meta=None):
    """Eagerly load model, centers, and preprocess_meta into module-level caches.

    This is intended to be called at app startup to surface load errors early and avoid
    per-request disk IO. The function is best-effort and will print warnings if artifacts
    are missing.
    """
    global _CACHED_MODEL, _CACHED_IDX_TO_CLASS, _CACHED_CENTERS, _CACHED_PREPROCESS_META

    # prefer existing saved preprocess_meta if not explicitly provided
    if preprocess_meta is None:
        candidate = os.path.join(os.getcwd(), 'preprocess_meta.npz')
        if os.path.exists(candidate):
            preprocess_meta = candidate

    _CACHED_PREPROCESS_META = preprocess_meta

    # load centers
    if _CACHED_CENTERS is None:
        if centers_path and os.path.exists(centers_path):
            try:
                npz = np.load(centers_path)
                _CACHED_CENTERS = npz['centers']
                print(f'Loaded centers from {centers_path}')
            except Exception as e:
                print('Warning: failed to load centers:', e)
                _CACHED_CENTERS = None
        else:
            print('No centers file found at', centers_path)
            _CACHED_CENTERS = None

    num_classes = _CACHED_CENTERS.shape[0] if _CACHED_CENTERS is not None else 10

    # load model
    if _CACHED_MODEL is None:
        try:
            _CACHED_MODEL, _CACHED_IDX_TO_CLASS = load_model(model_path, device=None, in_channels=3, num_classes=num_classes)
            device = 'cuda' if torch.cuda.is_available() else 'cpu'
            _CACHED_MODEL.to(device)
            print(f'Loaded model from {model_path}')
        except Exception as e:
            print('Warning: failed to load model:', e)
            _CACHED_MODEL = None

    return {
        'model_loaded': _CACHED_MODEL is not None,
        'centers_loaded': _CACHED_CENTERS is not None,
        'preprocess_meta': _CACHED_PREPROCESS_META
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--lat', type=float, required=True)
    parser.add_argument('--lon', type=float, required=True)
    parser.add_argument('--datetime', default=None, help='ISO datetime string to query hourly weather (optional)')
    parser.add_argument('--street', default='')
    parser.add_argument('--api-key', default=None, help='OpenWeather API key or use OPENWEATHER_KEY env var')
    parser.add_argument('--train-csv', default=None, help='Path to training CSV to compute preprocessing stats (optional if --preprocess-meta provided)')
    parser.add_argument('--preprocess-meta', default=None, help='Path to precomputed preprocess_meta.npz (optional)')
    parser.add_argument('--model', default='model.pth')
    parser.add_argument('--centers', default='kmeans_centers_all.npz')
    parser.add_argument('--roadrisk-url', default=None, help='Optional custom RoadRisk API URL (if provided, will be queried instead of OneCall)')
    args = parser.parse_args()

    out = predict_from_openmeteo(args.lat, args.lon, dt_iso=args.datetime, street=args.street, api_key=args.api_key, train_csv=args.train_csv, preprocess_meta=args.preprocess_meta, model_path=args.model, centers_path=args.centers, roadrisk_url=args.roadrisk_url)
    print(json.dumps(out, indent=2))
