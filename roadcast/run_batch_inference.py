import os
import argparse
import pandas as pd
import numpy as np
import time

import openweather_inference as owi


def find_column(df_cols, candidates):
    cmap = {c.lower(): c for c in df_cols}
    for cand in candidates:
        if cand.lower() in cmap:
            return cmap[cand.lower()]
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('csv', help='Path to data CSV (e.g., data.csv)')
    parser.add_argument('--out', default='inference_results.csv')
    parser.add_argument('--lat-col', default=None)
    parser.add_argument('--lon-col', default=None)
    parser.add_argument('--date-col', default=None)
    parser.add_argument('--model', default='model.pth')
    parser.add_argument('--centers', default='kmeans_centers_all.npz')
    parser.add_argument('--preprocess-meta', default=None)
    parser.add_argument('--api-key', default=None)
    parser.add_argument('--live', action='store_true', help='If set, call external RoadRisk/OpenWeather per row')
    parser.add_argument('--roadrisk-url', default=None, help='Optional per-request RoadRisk URL to use when --live')
    parser.add_argument('--subset', type=int, default=0, help='Process only first N rows for testing')
    args = parser.parse_args()

    df = pd.read_csv(args.csv, low_memory=False)
    nrows = args.subset if args.subset and args.subset > 0 else len(df)
    df = df.iloc[:nrows].copy()

    # find sensible columns
    lat_col = args.lat_col or find_column(df.columns, ['latitude', 'lat', 'mpdlatitude'])
    lon_col = args.lon_col or find_column(df.columns, ['longitude', 'lon', 'mpdlongitude'])
    date_col = args.date_col or find_column(df.columns, ['report_dat', 'reportdate', 'fromdate', 'lastupdatedate', 'date', 'occur_date'])

    if lat_col is None or lon_col is None:
        raise SystemExit('Could not find latitude/longitude columns automatically. Pass --lat-col and --lon-col.')

    print(f'Using lat column: {lat_col}, lon column: {lon_col}, date column: {date_col}')

    # eager init caches
    status = owi.init_inference(model_path=args.model, centers_path=args.centers, preprocess_meta=args.preprocess_meta)
    print('init status:', status)

    results = []
    t0 = time.time()
    for i, row in df.iterrows():
        lat = row.get(lat_col)
        lon = row.get(lon_col)
        dt = row.get(date_col) if date_col else None

        try:
            if args.live:
                # call the full pipeline which may hit remote API
                out = owi.predict_from_openweather(lat, lon, dt_iso=dt, street=None, api_key=args.api_key, train_csv=None, preprocess_meta=args.preprocess_meta, model_path=args.model, centers_path=args.centers, roadrisk_url=args.roadrisk_url)
            else:
                # local-only path: build row, prepare features using preprocess_meta, and run cached model
                df_row = owi.build_row(lat, lon, dt_iso=dt, street=None, extra_weather=None)
                x_tensor, feature_columns = owi.prepare_features(df_row, train_csv=None, preprocess_meta=args.preprocess_meta)
                # ensure model cached
                if owi._CACHED_MODEL is None:
                    owi.init_inference(model_path=args.model, centers_path=args.centers, preprocess_meta=args.preprocess_meta)
                model = owi._CACHED_MODEL
                centers = owi._CACHED_CENTERS
                device = 'cuda' if __import__('torch').cuda.is_available() else 'cpu'
                model.to(device)
                xt = x_tensor.to(device)
                import torch
                import torch.nn.functional as F
                with torch.no_grad():
                    logits = model(xt)
                    probs = F.softmax(logits, dim=1).cpu().numpy()[0]
                    pred_idx = int(probs.argmax())
                    confidence = float(probs.max())
                out = {'pred_cluster': pred_idx, 'confidence': confidence, 'probabilities': probs.tolist(), 'centroid': centers[pred_idx].tolist() if centers is not None else None, 'feature_columns': feature_columns}
        except Exception as e:
            out = {'error': str(e)}

        # combine row and output into flat result
        res = {
            'orig_index': i,
            'lat': lat,
            'lon': lon,
            'datetime': str(dt),
        }
        if 'error' in out:
            res.update({'error': out['error']})
        else:
            res.update({
                'pred_cluster': int(out.get('pred_cluster')),
                'confidence': float(out.get('confidence')),
            })
        results.append(res)

        if (len(results) % 50) == 0:
            print(f'Processed {len(results)}/{nrows} rows...')

    elapsed = time.time() - t0
    print(f'Finished {len(results)} rows in {elapsed:.2f}s')
    out_df = pd.DataFrame(results)
    out_df.to_csv(args.out, index=False)
    print('Wrote', args.out)


if __name__ == '__main__':
    main()
