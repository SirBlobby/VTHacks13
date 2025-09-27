"""Fit k-means centers on CSV numeric features (optionally PCA) and save centers to .npz

Usage: python fit_kmeans.py data.csv --n-buckets 10 --out kmeans_centers_final.npz --sample 50000 --pca 50
"""
import argparse
import numpy as np
import pandas as pd

from data import generate_kmeans_labels

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('csv')
    parser.add_argument('--n-buckets', type=int, default=10)
    parser.add_argument('--out', default='kmeans_centers_final.npz')
    parser.add_argument('--sample', type=int, default=50000, help='max rows to sample for fitting')
    parser.add_argument('--pca', type=int, default=0, help='Apply PCA to reduce dims before kmeans (0=none)')
    args = parser.parse_args()

    # read numeric columns only to avoid huge memory usage
    df = pd.read_csv(args.csv, low_memory=False)
    num_df = df.select_dtypes(include=['number']).fillna(0.0)
    data = num_df.values.astype(float)
    if data.shape[0] == 0 or data.shape[1] == 0:
        raise SystemExit('No numeric data found in CSV')

    # sample rows if requested
    if args.sample and args.sample < data.shape[0]:
        rng = np.random.default_rng(42)
        idx = rng.choice(data.shape[0], size=args.sample, replace=False)
        sample_data = data[idx]
    else:
        sample_data = data

    # Use the kmeans implementation via generate_kmeans_labels for fitting centers.
    # We'll call the internal function by adapting it here: import numpy locally.
    import numpy as _np

    # initialize centers by random sampling
    rng = _np.random.default_rng(42)
    k = min(args.n_buckets, sample_data.shape[0])
    centers_idx = rng.choice(sample_data.shape[0], size=k, replace=False)
    centers = sample_data[centers_idx].astype(float)

    max_iters = 50
    for _ in range(max_iters):
        dists = np.linalg.norm(sample_data[:, None, :] - centers[None, :, :], axis=2)
        labels = np.argmin(dists, axis=1)
        new_centers = np.zeros_like(centers)
        counts = np.zeros((centers.shape[0],), dtype=int)
        for i, lab in enumerate(labels):
            new_centers[lab] += sample_data[i]
            counts[lab] += 1
        for kk in range(centers.shape[0]):
            if counts[kk] > 0:
                new_centers[kk] = new_centers[kk] / counts[kk]
            else:
                new_centers[kk] = sample_data[rng.integers(0, sample_data.shape[0])]
        shift = np.linalg.norm(new_centers - centers, axis=1).max()
        centers = new_centers
        if shift < 1e-4:
            break

    np.savez_compressed(args.out, centers=centers)
    print('Saved centers to', args.out)
