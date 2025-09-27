import os
import hashlib
from datetime import datetime
import pandas as pd
import numpy as np
import torch
from torch.utils.data import Dataset
from PIL import Image
from torchvision import transforms


class ImageFolderDataset(Dataset):
    """A minimal image folder dataset expecting a structure: root/class_name/*.jpg"""
    def __init__(self, root, transform=None):
        self.root = root
        self.samples = []  # list of (path, label)
        classes = sorted([d for d in os.listdir(root) if os.path.isdir(os.path.join(root, d))])
        self.class_to_idx = {c: i for i, c in enumerate(classes)}
        for c in classes:
            d = os.path.join(root, c)
            for fname in os.listdir(d):
                if fname.lower().endswith(('.png', '.jpg', '.jpeg')):
                    self.samples.append((os.path.join(d, fname), self.class_to_idx[c]))

        self.transform = transform or transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
        ])

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert('RGB')
        img = self.transform(img)
        return img, label


class CSVDataset(Dataset):
    """Load classification tabular data from a single CSV file.

    Expects a `label` column and numeric feature columns. Non-numeric columns are dropped.
    """
    def __init__(self, csv_path, feature_columns=None, label_column='label', transform=None, generate_labels=False, n_buckets=100, label_method='md5', label_store=None, feature_engineer=False, lat_lon_bins=20, nrows=None):
        # read CSV with low_memory=False to avoid mixed-type warnings
        if nrows is None:
            self.df = pd.read_csv(csv_path, low_memory=False)
        else:
            self.df = pd.read_csv(csv_path, nrows=nrows, low_memory=False)
        self.label_column = label_column

        if generate_labels:
            # generate deterministic labels based on selected columns
            self.df[self.label_column] = generate_labels_for_df(self.df, n_buckets=n_buckets, method=label_method, label_store=label_store)

        # optional simple feature engineering: extract date parts and lat/lon bins
        if feature_engineer:
            try:
                _add_date_features(self.df)
            except Exception:
                pass
            try:
                _add_latlon_bins(self.df, bins=lat_lon_bins)
            except Exception:
                pass

        if label_column not in self.df.columns:
            raise ValueError(f"label column '{label_column}' not found in CSV; set generate_labels=True to create labels")

        # determine feature columns if not provided (numeric columns except label)
        if feature_columns is None:
            feature_columns = [c for c in self.df.columns if c != label_column and pd.api.types.is_numeric_dtype(self.df[c])]
        self.feature_columns = feature_columns
        # coerce feature columns to numeric, fill NaNs with column mean (or 0), then standardize
        features_df = self.df[self.feature_columns].apply(lambda c: pd.to_numeric(c, errors='coerce'))
        # fill NaNs with column mean where possible, otherwise 0
        initial_means = features_df.mean()
        features_df = features_df.fillna(initial_means).fillna(0.0)

        # drop columns that remain all-NaN after coercion/fill (unlikely after fillna(0.0)), to avoid NaNs
        all_nan_cols = features_df.columns[features_df.isna().all()].tolist()
        if len(all_nan_cols) > 0:
            # remove from feature list so indices stay consistent
            features_df = features_df.drop(columns=all_nan_cols)
            self.feature_columns = [c for c in self.feature_columns if c not in all_nan_cols]

        # recompute means/stds from the filled data so subtraction/division won't produce NaNs
        col_means = features_df.mean()
        col_stds = features_df.std().replace(0, 1.0).fillna(1.0)

        # standardize using the recomputed stats
        features_df = (features_df - col_means) / (col_stds + 1e-6)

        self.feature_means = col_means.to_numpy(dtype=float)
        self.feature_stds = col_stds.to_numpy(dtype=float)

        self.features = torch.tensor(features_df.values, dtype=torch.float32)
        self.labels = torch.tensor(pd.to_numeric(self.df[self.label_column], errors='coerce').fillna(0).astype(int).values, dtype=torch.long)

    def __len__(self):
        return len(self.df)

    def __getitem__(self, idx):
        return self.features[idx], int(self.labels[idx])


def _normalize_str(x):
    if pd.isna(x):
        return ''
    return str(x).strip().lower()


def _normalize_date(x):
    try:
        # try parse common formats
        dt = pd.to_datetime(x)
        return dt.strftime('%Y-%m-%d')
    except Exception:
        return ''


def generate_kmeans_labels(df, n_buckets=100, random_state=42, label_store=None):
    """Generate labels by running k-means over numeric features (deterministic with seed).

    This produces clusters that are predictable from numeric inputs and are therefore
    better suited for training a numeric-feature MLP than arbitrary hash buckets.
    """
    # small pure-numpy k-means to avoid external dependency
    import numpy as np

    # select numeric columns only
    num_df = df.select_dtypes(include=['number']).fillna(0.0)
    if num_df.shape[0] == 0 or num_df.shape[1] == 0:
        # fallback to hashing if no numeric columns
        return generate_labels_for_df(df, n_buckets=n_buckets)

    data = num_df.values.astype(float)
    n_samples = data.shape[0]
    rng = np.random.default_rng(random_state)

    # If a label_store exists and contains centers, load and use them
    import os
    if label_store and os.path.exists(label_store):
        try:
            npz = np.load(label_store)
            centers = npz['centers']
            all_dists = np.linalg.norm(data[:, None, :] - centers[None, :, :], axis=2)
            all_labels = np.argmin(all_dists, axis=1)
            return pd.Series(all_labels, index=df.index)
        except Exception:
            # fall through to fitting
            pass

    # sample points to fit centers if dataset is large
    sample_size = min(20000, n_samples)
    if sample_size < n_samples:
        idx = rng.choice(n_samples, size=sample_size, replace=False)
        sample_data = data[idx]
    else:
        sample_data = data

    # initialize centers by random sampling from sample_data
    centers_idx = rng.choice(sample_data.shape[0], size=min(n_buckets, sample_data.shape[0]), replace=False)
    centers = sample_data[centers_idx].astype(float)

    # run a small number of iterations
    max_iters = 10
    for _ in range(max_iters):
        # assign
        dists = np.linalg.norm(sample_data[:, None, :] - centers[None, :, :], axis=2)
        labels = np.argmin(dists, axis=1)
        # recompute centers
        new_centers = np.zeros_like(centers)
        counts = np.zeros((centers.shape[0],), dtype=int)
        for i, lab in enumerate(labels):
            new_centers[lab] += sample_data[i]
            counts[lab] += 1
        for k in range(centers.shape[0]):
            if counts[k] > 0:
                new_centers[k] = new_centers[k] / counts[k]
            else:
                # reinitialize empty cluster
                new_centers[k] = sample_data[rng.integers(0, sample_data.shape[0])]
        # check convergence (centers change small)
        shift = np.linalg.norm(new_centers - centers, axis=1).max()
        centers = new_centers
        if shift < 1e-4:
            break

    # assign labels for all data
    all_dists = np.linalg.norm(data[:, None, :] - centers[None, :, :], axis=2)
    all_labels = np.argmin(all_dists, axis=1)
    # persist centers if requested
    if label_store:
        try:
            np.savez_compressed(label_store, centers=centers)
        except Exception:
            pass
    return pd.Series(all_labels, index=df.index)


def generate_labels_for_df(df, n_buckets=100, method='md5', label_store=None):
    """Generate deterministic bucket labels 1..n_buckets from rows using selected columns.

    Uses: report_dat, latitude, longitude, street1, street2, ward, injuries, fatalities.
    Produces reproducible labels via md5 hashing of a normalized feature string.
    """
    if method == 'kmeans':
        return generate_kmeans_labels(df, n_buckets=n_buckets, label_store=label_store)

    # Be flexible about column names (case variations and alternate names).
    colmap = {c.lower(): c for c in df.columns}

    def get_col(*candidates):
        for cand in candidates:
            key = cand.lower()
            if key in colmap:
                return colmap[key]
        return None

    report_col = get_col('report_dat', 'reportdate', 'fromdate', 'lastupdatedate')
    lat_col = get_col('latitude', 'mpdlatitude', 'lat')
    lon_col = get_col('longitude', 'mpdlongitude', 'lon')
    street1_col = get_col('street1', 'address', 'mar_address', 'nearestintstreetname')
    street2_col = get_col('street2', 'nearestintstreetname')
    ward_col = get_col('ward')

    inj_cols = [c for c in df.columns if 'INJUR' in c.upper()]
    fat_cols = [c for c in df.columns if 'FATAL' in c.upper()]

    uid = get_col('crimeid', 'eventid', 'objectid', 'ccn')

    def row_to_bucket(row):
        parts = []
        # date
        parts.append(_normalize_date(row.get(report_col, '') if report_col else ''))
        # lat/lon rounded
        lat = row.get(lat_col, '') if lat_col else ''
        lon = row.get(lon_col, '') if lon_col else ''
        try:
            parts.append(str(round(float(lat), 5)) if pd.notna(lat) and lat != '' else '')
        except Exception:
            parts.append('')
        try:
            parts.append(str(round(float(lon), 5)) if pd.notna(lon) and lon != '' else '')
        except Exception:
            parts.append('')

        # streets and ward
        parts.append(_normalize_str(row.get(street1_col, '') if street1_col else ''))
        parts.append(_normalize_str(row.get(street2_col, '') if street2_col else ''))
        parts.append(_normalize_str(row.get(ward_col, '') if ward_col else ''))

        # injuries: sum any injury-like columns
        inj_sum = 0
        for c in inj_cols:
            try:
                v = row.get(c, 0)
                inj_sum += int(v) if pd.notna(v) and v != '' else 0
            except Exception:
                pass
        parts.append(str(inj_sum))

        # fatalities: sum any fatal-like columns
        fat_sum = 0
        for c in fat_cols:
            try:
                v = row.get(c, 0)
                fat_sum += int(v) if pd.notna(v) and v != '' else 0
            except Exception:
                pass
        parts.append(str(fat_sum))

        # fallback uid
        if uid:
            parts.append(str(row.get(uid, '')))

        s = '|'.join(parts)
        h = hashlib.md5(s.encode('utf-8')).hexdigest()
        val = int(h, 16) % n_buckets
        return val

    return df.apply(row_to_bucket, axis=1)


def _add_date_features(df, date_col_candidates=None):
    """Add simple date-derived numeric columns to the dataframe.

    Adds: report_year, report_month, report_day, report_weekday, report_hour (where available).
    If no date column is found, function is a no-op.
    """
    if date_col_candidates is None:
        date_col_candidates = ['report_dat', 'reportdate', 'fromdate', 'lastupdatedate', 'date', 'occur_date']
    colmap = {c.lower(): c for c in df.columns}
    date_col = None
    for cand in date_col_candidates:
        if cand.lower() in colmap:
            date_col = colmap[cand.lower()]
            break
    if date_col is None:
        return
    try:
        ser = pd.to_datetime(df[date_col], errors='coerce')
    except Exception:
        ser = pd.to_datetime(df[date_col].astype(str), errors='coerce')

    df['report_year'] = ser.dt.year.fillna(-1).astype(float)
    df['report_month'] = ser.dt.month.fillna(-1).astype(float)
    df['report_day'] = ser.dt.day.fillna(-1).astype(float)
    df['report_weekday'] = ser.dt.weekday.fillna(-1).astype(float)
    # hour may not exist; if parsing fails we'll get NaN
    df['report_hour'] = ser.dt.hour.fillna(-1).astype(float)


def _add_hashed_street(df, n_hash_buckets=32, street_col_candidates=None):
    """Add a small hashed numeric feature for street/address text fields.

    Adds `street_hash_0..N-1` as dense float columns containing one-hot-ish hashed values.
    Uses MD5-based hashing reduced to a bucket and then maps to a small integer vector.
    """
    if street_col_candidates is None:
        street_col_candidates = ['street1', 'street', 'address', 'mar_address', 'nearestintstreetname']
    colmap = {c.lower(): c for c in df.columns}
    street_col = None
    for cand in street_col_candidates:
        if cand.lower() in colmap:
            street_col = colmap[cand.lower()]
            break
    if street_col is None:
        return

    import hashlib
    # create a single integer hash bucket per row
    def row_hash(val):
        if pd.isna(val) or str(val).strip() == '':
            return -1
        h = hashlib.md5(str(val).encode('utf-8')).hexdigest()
        return int(h, 16) % n_hash_buckets

    buckets = df[street_col].apply(row_hash).fillna(-1).astype(int).to_numpy()
    # create N numeric columns with a one-hot style (0/1) encoded as floats; missing bucket => zeros
    for i in range(n_hash_buckets):
        colname = f'street_hash_{i}'
        df[colname] = (buckets == i).astype(float)


def _add_latlon_bins(df, bins=20, lat_col_candidates=None, lon_col_candidates=None):
    """Add coarse spatial bins for latitude/longitude and rounded lat/lon numeric features.

    Adds: lat_round, lon_round, lat_bin, lon_bin (bins numbered 0..bins-1, -1 for missing).
    """
    if lat_col_candidates is None:
        lat_col_candidates = ['latitude', 'mpdlatitude', 'lat']
    if lon_col_candidates is None:
        lon_col_candidates = ['longitude', 'mpdlongitude', 'lon']
    colmap = {c.lower(): c for c in df.columns}
    lat_col = None
    lon_col = None
    for cand in lat_col_candidates:
        if cand.lower() in colmap:
            lat_col = colmap[cand.lower()]
            break
    for cand in lon_col_candidates:
        if cand.lower() in colmap:
            lon_col = colmap[cand.lower()]
            break
    if lat_col is None or lon_col is None:
        return
    try:
        lat = pd.to_numeric(df[lat_col], errors='coerce')
        lon = pd.to_numeric(df[lon_col], errors='coerce')
    except Exception:
        lat = pd.to_numeric(df[lat_col].astype(str), errors='coerce')
        lon = pd.to_numeric(df[lon_col].astype(str), errors='coerce')

    df['lat_round'] = lat.round(3).fillna(0.0).astype(float)
    df['lon_round'] = lon.round(3).fillna(0.0).astype(float)

    try:
        # compute bins using quantiles if possible to get balanced bins; fallback to linear bins
        valid_lat = lat.dropna()
        valid_lon = lon.dropna()
        if len(valid_lat) >= bins and len(valid_lon) >= bins:
            # qcut may produce NaNs for duplicates; use rank-based discretization
            df['lat_bin'] = pd.qcut(lat.rank(method='first'), q=bins, labels=False, duplicates='drop')
            df['lon_bin'] = pd.qcut(lon.rank(method='first'), q=bins, labels=False, duplicates='drop')
        else:
            lat_min, lat_max = valid_lat.min() if len(valid_lat) > 0 else 0.0, valid_lat.max() if len(valid_lat) > 0 else 0.0
            lon_min, lon_max = valid_lon.min() if len(valid_lon) > 0 else 0.0, valid_lon.max() if len(valid_lon) > 0 else 0.0
            lat_span = (lat_max - lat_min) + 1e-6
            lon_span = (lon_max - lon_min) + 1e-6
            df['lat_bin'] = (((lat - lat_min) / lat_span) * bins).fillna(-1).astype(int).clip(lower=-1, upper=bins-1)
            df['lon_bin'] = (((lon - lon_min) / lon_span) * bins).fillna(-1).astype(int).clip(lower=-1, upper=bins-1)
    except Exception:
        # fallback: set -1 for bins
        df['lat_bin'] = -1
        df['lon_bin'] = -1


# Debugging code - to be removed or commented out in production
# python - <<'PY'
# import pandas as pd
# from data import generate_labels_for_df
# df = pd.read_csv('data.csv', nrows=50, low_memory=False)
# labs = generate_labels_for_df(df, n_buckets=100)
# print(df[['REPORTDATE','LATITUDE','LONGITUDE','ADDRESS','WARD']].head().to_string())
# print('labels:', list(labs[:20]))
# PY

# Command to run the training (to be executed in the terminal, not in the script)
# python train.py data.csv --model-type mlp --generate-labels --n-buckets 100 --epochs 5 --batch-size 256 --lr 1e-3

