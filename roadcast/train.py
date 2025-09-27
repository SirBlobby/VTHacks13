import os
import time
import torch
from torch import nn, optim
from torch.utils.data import DataLoader, random_split
from tqdm import tqdm

from data import ImageFolderDataset, CSVDataset
from models import create_model


def train(dataset_root, epochs=3, batch_size=16, lr=1e-3, device=None, num_classes=10, model_type='mlp', csv_label='label', generate_labels=False, n_buckets=100, label_method='md5', label_store=None, feature_engineer=False, lat_lon_bins=20, nrows=None, seed=42, hidden_dims=None, weight_decay=0.0, output_dir=None):
    device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
    output_dir = output_dir or os.getcwd()
    os.makedirs(output_dir, exist_ok=True)
    # Detect CSV vs folder dataset
    if os.path.isfile(dataset_root) and dataset_root.lower().endswith('.csv'):
        dataset = CSVDataset(dataset_root,
                             label_column=csv_label,
                             generate_labels=generate_labels,
                             n_buckets=n_buckets,
                             label_method=label_method,
                             label_store=label_store,
                             feature_engineer=feature_engineer,
                             lat_lon_bins=lat_lon_bins,
                             nrows=nrows)
        # seed numpy/torch RNGs for reproducibility in experiments
        try:
            import numpy as _np
            _np.random.seed(seed)
        except Exception:
            pass
        try:
            import random as _py_random
            _py_random.seed(seed)
        except Exception:
            pass
        try:
            import torch as _torch
            _torch.manual_seed(seed)
            if _torch.cuda.is_available():
                _torch.cuda.manual_seed_all(seed)
        except Exception:
            pass
        # determine input dim for MLP
        input_dim = dataset.features.shape[1]
        # persist preprocessing metadata so inference can reuse identical stats
        try:
            import numpy as _np
            meta_path = os.path.join(output_dir, 'preprocess_meta.npz')
            _np.savez_compressed(meta_path, feature_columns=_np.array(dataset.feature_columns, dtype=object), means=dataset.feature_means, stds=dataset.feature_stds)
            print(f'Saved preprocess meta to {meta_path}')
        except Exception:
            pass
        if model_type == 'cnn':
            raise ValueError('CSV dataset should use model_type="mlp"')
        # if we generated labels, infer the actual number of classes from the dataset labels
        if generate_labels and hasattr(dataset, 'labels'):
            try:
                model_num_classes = int(dataset.labels.max().item()) + 1
            except Exception:
                model_num_classes = n_buckets
        else:
            model_num_classes = n_buckets if generate_labels else num_classes
        # If labels were generated, save label metadata + assignments (if not huge)
        if generate_labels:
            try:
                label_info = {
                    "generated": True,
                    "label_method": label_method,
                    "n_buckets": n_buckets,
                }
                # save per-sample assignments if dataset exposes them
                if hasattr(dataset, "labels"):
                    try:
                        # convert to list (JSON serializable)
                        assignments = dataset.labels.cpu().numpy().tolist() if hasattr(dataset.labels, "cpu") else dataset.labels.tolist()
                        # if too large, save as .npz instead
                        if len(assignments) <= 100000:
                            label_info["assignments"] = assignments
                        else:
                            import numpy as _np
                            arr_path = os.path.join(output_dir, "label_assignments.npz")
                            _np.savez_compressed(arr_path, assignments=_np.array(assignments))
                            label_info["assignments_file"] = os.path.basename(arr_path)
                    except Exception:
                        pass
                with open(os.path.join(output_dir, "label_info.json"), "w") as f:
                    import json
                    json.dump(label_info, f)
                print(f"Saved label_info to {os.path.join(output_dir, 'label_info.json')}")
            except Exception:
                pass
        # parse hidden_dims if provided by caller (tuple or list)
        model = create_model(device=device, model_type='mlp', input_dim=input_dim, num_classes=model_num_classes, hidden_dims=hidden_dims)
    else:
        # assume folder of images
        dataset = ImageFolderDataset(dataset_root)
        model = create_model(device=device, model_type='cnn', input_size=(3, 224, 224), num_classes=num_classes)

    # simple train/val split
    val_size = max(1, int(0.1 * len(dataset)))
    train_size = len(dataset) - val_size
    train_set, val_set = random_split(dataset, [train_size, val_size])
    train_loader = DataLoader(train_set, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_set, batch_size=batch_size, shuffle=False)

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)

    best_val_acc = 0.0
    best_path = None

    for epoch in range(epochs):
        model.train()
        running_loss = 0.0
        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{epochs}")
        for xb, yb in pbar:
            xb = xb.to(device)
            yb = yb.to(device)
            optimizer.zero_grad()
            outputs = model(xb)
            loss = criterion(outputs, yb)
            loss.backward()
            optimizer.step()
            running_loss += loss.item()
            pbar.set_postfix(loss=running_loss / (pbar.n + 1))

        # validation
        model.eval()
        correct = 0
        total = 0
        with torch.no_grad():
            for xb, yb in val_loader:
                xb = xb.to(device)
                yb = yb.to(device)
                outputs = model(xb)
                preds = outputs.argmax(dim=1)
                correct += (preds == yb).sum().item()
                total += yb.size(0)
        val_acc = correct / total if total > 0 else 0.0
        print(f"Epoch {epoch+1} val_acc={val_acc:.4f}")

        # save best
        if val_acc > best_val_acc:
            out_path = os.path.join(output_dir, 'model.pth')
            # include useful metadata so evaluator can reconstruct
            meta = {
                'model_state_dict': model.state_dict(),
                'model_type': model_type,
                'model_config': {
                    'input_dim': input_dim if model_type == 'mlp' else None,
                    'num_classes': model_num_classes,
                    'hidden_dims': hidden_dims,
                }
            }
            if hasattr(dataset, 'class_to_idx'):
                meta['class_to_idx'] = dataset.class_to_idx
            # also record paths to saved preprocess and label info (if present)
            meta['preprocess_meta'] = os.path.basename(os.path.join(output_dir, 'preprocess_meta.npz'))
            if os.path.exists(os.path.join(output_dir, 'label_info.json')):
                meta['label_info'] = json.load(open(os.path.join(output_dir, 'label_info.json'), 'r'))
            torch.save(meta, out_path)
            best_val_acc = val_acc
            best_path = out_path
            print(f"Saved best model to {out_path} (val_acc={val_acc:.4f})")

    return best_path


if __name__ == '__main__':
    import argparse
    import json
    parser = argparse.ArgumentParser()
    parser.add_argument('data_root')
    parser.add_argument('--epochs', type=int, default=3)
    parser.add_argument('--batch-size', type=int, default=16)
    parser.add_argument('--lr', type=float, default=1e-3)
    parser.add_argument('--model-type', choices=['cnn', 'mlp'], default='cnn')
    parser.add_argument('--csv-label', default='label')
    parser.add_argument('--generate-labels', action='store_true', help='If set, generate labels from columns instead of expecting label column')
    parser.add_argument('--n-buckets', type=int, default=100, help='Number of label buckets when generating labels')
    parser.add_argument('--label-method', choices=['md5', 'kmeans'], default='md5', help='Method to generate labels when --generate-labels is set')
    parser.add_argument('--label-store', default=None, help='Path to save/load label metadata (e.g., kmeans centers .npz)')
    parser.add_argument('--subset', type=int, default=0, help='If set (>0), load only first N rows from CSV for fast experiments')
    parser.add_argument('--feature-engineer', action='store_true', help='If set, add simple date and lat/lon engineered features')
    parser.add_argument('--lat-lon-bins', type=int, default=20, help='Number of bins for lat/lon coarse spatial features')
    parser.add_argument('--seed', type=int, default=42, help='Random seed for experiments')
    parser.add_argument('--hidden-dims', type=str, default='', help='Comma-separated hidden dims for MLP, e.g. "256,128"')
    parser.add_argument('--weight-decay', type=float, default=0.0, help='Weight decay (L2) for optimizer')
    parser.add_argument('--output-dir', default='.', help='Directory to save output files')
    args = parser.parse_args()
    data_root = args.data_root
    nrows = args.subset if args.subset > 0 else None
    # parse hidden dims
    hidden_dims = None
    if args.hidden_dims:
        try:
            hidden_dims = tuple(int(x) for x in args.hidden_dims.split(',') if x.strip())
        except Exception:
            hidden_dims = None
    if args.generate_labels:
        os.makedirs(args.output_dir, exist_ok=True)
        label_info = {
            "generated": True,
            "label_method": args.label_method,
            "n_buckets": args.n_buckets,
        }
        with open(os.path.join(args.output_dir, "label_info.json"), "w") as f:
            json.dump(label_info, f)
    train(data_root, epochs=args.epochs, batch_size=args.batch_size, lr=args.lr, model_type=args.model_type, csv_label=args.csv_label, generate_labels=args.generate_labels, n_buckets=args.n_buckets, label_method=args.label_method, label_store=args.label_store, feature_engineer=args.feature_engineer, lat_lon_bins=args.lat_lon_bins, nrows=nrows, seed=args.seed, hidden_dims=hidden_dims, weight_decay=args.weight_decay, output_dir=args.output_dir)

