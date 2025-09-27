import traceback
import numpy as np
import torch
from torch.utils.data import DataLoader

from data import CSVDataset
from models import create_model


def print_arr_stats(name, arr):
    arr = np.asarray(arr)
    print(f"{name}: shape={arr.shape} dtype={arr.dtype}")
    print(f"  mean={np.nanmean(arr):.6f} std={np.nanstd(arr):.6f} min={np.nanmin(arr):.6f} max={np.nanmax(arr):.6f}")
    print(f"  any_nan={np.isnan(arr).any()} any_inf={np.isinf(arr).any()}")


def main():
    try:
        print('Loading dataset...')
        ds = CSVDataset('data.csv', generate_labels=True, n_buckets=100)
        print(f'dataset length: {len(ds)}')

        X = ds.features.numpy()
        y = ds.labels.numpy()

        print_arr_stats('X (all)', X)
        # per-column NaN/inf counts
        nan_counts = np.isnan(X).sum(axis=0)
        inf_counts = np.isinf(X).sum(axis=0)
        print('per-column nan counts (first 20):', nan_counts[:20].tolist())
        print('per-column inf counts (first 20):', inf_counts[:20].tolist())

        print('Labels stats: unique count=', len(np.unique(y)))
        print('Labels min/max:', int(y.min()), int(y.max()))
        vals, counts = np.unique(y, return_counts=True)
        print('Label distribution (first 20):', list(zip(vals[:20].tolist(), counts[:20].tolist())))

        # get a small batch
        dl = DataLoader(ds, batch_size=64, shuffle=False)
        xb, yb = next(iter(dl))
        print_arr_stats('xb batch', xb.numpy())
        print('yb batch unique:', np.unique(yb.numpy()))

        # build model
        print('Building model...')
        model = create_model(device='cpu', model_type='mlp', input_dim=X.shape[1], num_classes=100)
        model.eval()
        with torch.no_grad():
            out = model(xb)
        out_np = out.numpy()
        print_arr_stats('model outputs', out_np)

        # check for rows with NaN/Inf in features
        bad_rows = np.where(np.isnan(X).any(axis=1) | np.isinf(X).any(axis=1))[0]
        print('bad rows count:', len(bad_rows))
        if len(bad_rows) > 0:
            print('first bad row index:', bad_rows[0])
            print('row values:', X[bad_rows[0]].tolist())
            print('label:', int(y[bad_rows[0]]))

    except Exception as e:
        print('Exception during diagnostics:')
        traceback.print_exc()


if __name__ == '__main__':
    main()
