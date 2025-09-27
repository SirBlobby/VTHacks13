import argparse
import json
import os
import numpy as np
import pandas as pd
import torch
import torch.nn.functional as F
from sklearn.metrics import accuracy_score, classification_report
import matplotlib.pyplot as plt

# Minimal helper: try to reconstruct the model if checkpoint stores config, else attempt full-model load.
def load_checkpoint(checkpoint_path, model_builder=None, device="cpu"):
    ckpt = torch.load(checkpoint_path, map_location=device)
    # if checkpoint contains state_dict + model_config, try to rebuild using models.create_model
    if isinstance(ckpt, dict) and "model_state_dict" in ckpt:
        builder = model_builder
        if builder is None:
            try:
                from models import create_model as _create_model
                builder = lambda cfg: _create_model(device=device, model_type=cfg.get("model_type", "mlp") if "model_type" in cfg else "mlp", input_dim=cfg.get("input_dim"), num_classes=cfg.get("num_classes"), hidden_dims=cfg.get("hidden_dims"))
            except Exception:
                builder = None
        if builder is not None and "model_config" in ckpt:
            model = builder(ckpt.get("model_config", {}))
            model.load_state_dict(ckpt["model_state_dict"])
            model.to(device).eval()
            meta = {k: v for k, v in ckpt.items() if k not in ("model_state_dict",)}
            return model, meta
        else:
            # try to load full model object or raise
            try:
                model = ckpt
                model.to(device).eval()
                return model, {}
            except Exception:
                raise RuntimeError("Checkpoint contains model_state_dict but cannot reconstruct model; provide model_builder.")
    else:
        # maybe the full model object was saved
        try:
            model = ckpt
            model.to(device).eval()
            return model, {}
        except Exception as e:
            raise RuntimeError(f"Can't load checkpoint automatically: {e}")

def prepare_features(df, feature_cols=None):
    if feature_cols is None:
        # assume all columns except label are features
        return df.drop(columns=[c for c in df.columns if c.endswith("label")], errors='ignore').values.astype(np.float32)
    return df[feature_cols].values.astype(np.float32)

def plot_sample(x, true_label, pred_label):
    x = np.asarray(x)
    title = f"true: {true_label}  pred: {pred_label}"
    if x.ndim == 1:
        n = x.size
        sq = int(np.sqrt(n))
        if sq * sq == n:
            plt.imshow(x.reshape(sq, sq), cmap="gray")
            plt.title(title)
            plt.axis("off")
            plt.show()
            return
        if x.size <= 3:
            plt.bar(range(x.size), x)
            plt.title(title)
            plt.show()
            return
        # fallback: plot first 200 dims as line
        plt.plot(x[:200])
        plt.title(title + " (first 200 dims)")
        plt.show()
        return
    elif x.ndim == 2:
        plt.imshow(x, aspect='auto')
        plt.title(title)
        plt.show()
        return
    else:
        print("Sample too high-dim to plot, printing summary:")
        print("mean", x.mean(), "std", x.std())

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--checkpoint", required=True, help="Path to saved checkpoint (.pt)")
    p.add_argument("--data", required=True, help="CSV with features and optional label column")
    p.add_argument("--label-col", default=None, help="Original label column name in CSV (if present)")
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--sample-index", type=int, default=0, help="Index of a sample to plot")
    p.add_argument("--plot", action="store_true")
    p.add_argument("--device", default="cpu")
    args = p.parse_args()

    device = args.device
    # If your project has a known model class, replace model_builder with a lambda that instantiates it.
    model_builder = None

    # load checkpoint
    model, meta = load_checkpoint(args.checkpoint, model_builder=model_builder, device=device)

    # try to discover preprocess_meta and label_info
    ckpt_dir = os.path.dirname(args.checkpoint)
    preprocess_meta = None
    meta_preprocess_path = os.path.join(ckpt_dir, meta.get("preprocess_meta", "")) if isinstance(meta, dict) else None
    if meta_preprocess_path and os.path.exists(meta_preprocess_path):
        try:
            import numpy as _np
            d = _np.load(meta_preprocess_path, allow_pickle=True)
            preprocess_meta = {
                "feature_columns": [str(x) for x in d["feature_columns"].tolist()],
                "means": d["means"].astype(np.float32),
                "stds": d["stds"].astype(np.float32),
            }
            print(f"Loaded preprocess meta from {meta_preprocess_path}")
        except Exception:
            preprocess_meta = None

    # prefer label_col from CSV, otherwise load saved assignments if present
    y_true = None
    if args.label_col and args.label_col in df.columns:
        y_true = df[args.label_col].values
    else:
        # check label_info from checkpoint dir
        label_info_path = os.path.join(ckpt_dir, "label_info.json")
        label_info = {}
        if os.path.exists(label_info_path):
            with open(label_info_path, "r") as f:
                label_info = json.load(f)
        elif isinstance(meta, dict) and "label_info" in meta:
            label_info = meta["label_info"]
        if "assignments" in label_info:
            y_true = np.array(label_info["assignments"])
        elif "assignments_file" in label_info:
            try:
                import numpy as _np
                arr = _np.load(os.path.join(ckpt_dir, label_info["assignments_file"]))
                y_true = arr["assignments"]
            except Exception:
                pass

    # prepare features: if preprocess_meta is present use its feature_columns and scaling
    if preprocess_meta is not None:
        feature_cols = preprocess_meta["feature_columns"]
        feature_df = df[feature_cols]
        X = feature_df.values.astype(np.float32)
        # apply scaling
        means = preprocess_meta["means"]
        stds = preprocess_meta["stds"]
        stds[stds == 0] = 1.0
        X = (X - means) / stds
    else:
        if args.label_col and args.label_col in df.columns:
            feature_df = df.drop(columns=[args.label_col])
        else:
            feature_df = df.select_dtypes(include=[np.number])
        X = feature_df.values.astype(np.float32)

    # create DataLoader-like batching for inference
    model.to(device)
    model.eval()
    preds = []
    with torch.no_grad():
        for i in range(0, X.shape[0], args.batch_size):
            batch = torch.from_numpy(X[i:i+args.batch_size]).to(device)
            out = model(batch)  # adapt if your model returns (logits, ...)
            if isinstance(out, (tuple, list)):
                out = out[0]
            probs = F.softmax(out, dim=1) if out.dim() == 2 else out
            pred = probs.argmax(dim=1).cpu().numpy()
            preds.append(pred)
    preds = np.concatenate(preds, axis=0)

    if y_true is not None:
        acc = accuracy_score(y_true, preds)
        print(f"Accuracy: {acc:.4f}")
        print("Classification report:")
        print(classification_report(y_true, preds, zero_division=0))
    else:
        print("Predictions computed but no true labels available to compute accuracy.")
        print("First 20 predictions:", preds[:20])

    if args.plot:
        idx = args.sample_index
        if idx < 0 or idx >= X.shape[0]:
            print("sample-index out of range")
            return
        sample_x = X[idx]
        true_label = y_true[idx] if y_true is not None else None
        pred_label = preds[idx]
        plot_sample(sample_x, true_label, pred_label)

if __name__ == "__main__":
    main()
