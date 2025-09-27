import torch
import torch.nn as nn
import math
from typing import Union, Iterable
import numpy as np
import torch as _torch

def accidents_to_bucket(count: Union[int, float, Iterable],
                        max_count: int = 20000,
                        num_bins: int = 10) -> Union[int, list, _torch.Tensor, np.ndarray]:
    """
    Map accident counts to simple buckets 1..num_bins (equal-width).
    Example: max_count=20000, num_bins=10 -> bin width = 2000
      0-1999 -> 1, 2000-3999 -> 2, ..., 18000-20000 -> 10

    Args:
      count: single value or iterable (list/numpy/torch). Values <=0 map to 1, values >= max_count map to num_bins.
      max_count: expected maximum count (top of highest bin).
      num_bins: number of buckets (default 10).

    Returns:
      Same type as input (int for scalar, list/numpy/torch for iterables) with values in 1..num_bins.
    """
    width = max_count / float(num_bins)
    def _bucket_scalar(x):
        # clamp
        x = 0.0 if x is None else float(x)
        if x <= 0:
            return 1
        if x >= max_count:
            return num_bins
        return int(x // width) + 1

    # scalar int/float
    if isinstance(count, (int, float)):
        return _bucket_scalar(count)

    # torch tensor
    if isinstance(count, _torch.Tensor):
        x = count.clone().float()
        x = _torch.clamp(x, min=0.0, max=float(max_count))
        buckets = (x // width).to(_torch.long) + 1
        buckets = _torch.clamp(buckets, min=1, max=num_bins)
        return buckets

    # numpy array
    if isinstance(count, np.ndarray):
        x = np.clip(count.astype(float), 0.0, float(max_count))
        buckets = (x // width).astype(int) + 1
        return np.clip(buckets, 1, num_bins)

    # generic iterable -> list
    if isinstance(count, Iterable):
        return [ _bucket_scalar(float(x)) for x in count ]

    # fallback
    return _bucket_scalar(float(count))


class SimpleCNN(nn.Module):
    """A small CNN for image classification (adjustable). Automatically computes flattened size."""
    def __init__(self, in_channels=3, num_classes=10, input_size=(3, 224, 224)):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(in_channels, 32, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.MaxPool2d(2),
        )
        # compute flatten size using a dummy tensor
        with torch.no_grad():
            dummy = torch.zeros(1, *input_size)
            feat = self.features(dummy)
            # flat_features was previously computed as:
            #   int(feat.numel() / feat.shape[0])
            # Explanation:
            #   feat.shape == (N, C, H, W)  (for image inputs)
            #   feat.numel() == N * C * H * W
            #   dividing by N (feat.shape[0]) yields C * H * W, i.e. flattened size per sample
            # Clearer alternative using tensor shape:
            flat_features = int(torch.prod(torch.tensor(feat.shape[1:])).item())
            # If you need the linear index mapping for coordinates (c, h, w):
            #   idx = c * (H * W) + h * W + w

        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(flat_features, 256),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(256, num_classes),
        )

    def forward(self, x):
        x = self.features(x)
        x = self.classifier(x)
        return x


class MLP(nn.Module):
    """Simple MLP for tabular CSV data classification."""
    def __init__(self, input_dim, hidden_dims=(256, 128), num_classes=2):
        super().__init__()
        layers = []
        prev = input_dim
        for h in hidden_dims:
            layers.append(nn.Linear(prev, h))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(0.2))
            prev = h
        layers.append(nn.Linear(prev, num_classes))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x)


def create_model(device=None, in_channels=3, num_classes=10, input_size=(3, 224, 224), model_type='cnn', input_dim=None, hidden_dims=None):
    if model_type == 'mlp':
        if input_dim is None:
            raise ValueError('input_dim is required for mlp model_type')
        if hidden_dims is None:
            model = MLP(input_dim=input_dim, num_classes=num_classes)
        else:
            model = MLP(input_dim=input_dim, hidden_dims=hidden_dims, num_classes=num_classes)
    else:
        model = SimpleCNN(in_channels=in_channels, num_classes=num_classes, input_size=input_size)

    if device:
        model.to(device)
    return model
