# import torch
# import torch.nn as nn
# import math
# from typing import Union, Iterable
# import numpy as np
# import torch as _torch

# def accidents_to_bucket(count: Union[int, float, Iterable],
#                         max_count: int = 20000,
#                         num_bins: int = 10) -> Union[int, list, _torch.Tensor, np.ndarray]:
#     """
#     Map accident counts to simple buckets 1..num_bins (equal-width).
#     Example: max_count=20000, num_bins=10 -> bin width = 2000
#       0-1999 -> 1, 2000-3999 -> 2, ..., 18000-20000 -> 10

#     Args:
#       count: single value or iterable (list/numpy/torch). Values <=0 map to 1, values >= max_count map to num_bins.
#       max_count: expected maximum count (top of highest bin).
#       num_bins: number of buckets (default 10).

#     Returns:
#       Same type as input (int for scalar, list/numpy/torch for iterables) with values in 1..num_bins.
#     """
#     width = max_count / float(num_bins)
#     def _bucket_scalar(x):
#         # clamp
#         x = 0.0 if x is None else float(x)
#         if x <= 0:
#             return 1
#         if x >= max_count:
#             return num_bins
#         return int(x // width) + 1

#     # scalar int/float
#     if isinstance(count, (int, float)):
#         return _bucket_scalar(count)

#     # torch tensor
#     if isinstance(count, _torch.Tensor):
#         x = count.clone().float()
#         x = _torch.clamp(x, min=0.0, max=float(max_count))
#         buckets = (x // width).to(_torch.long) + 1
#         buckets = _torch.clamp(buckets, min=1, max=num_bins)
#         return buckets

#     # numpy array
#     if isinstance(count, np.ndarray):
#         x = np.clip(count.astype(float), 0.0, float(max_count))
#         buckets = (x // width).astype(int) + 1
#         return np.clip(buckets, 1, num_bins)

#     # generic iterable -> list
#     if isinstance(count, Iterable):
#         return [ _bucket_scalar(float(x)) for x in count ]

#     # fallback
#     return _bucket_scalar(float(count))


# class SimpleCNN(nn.Module):
#     """A small CNN for image classification (adjustable). Automatically computes flattened size."""
#     def __init__(self, in_channels=3, num_classes=10, input_size=(3, 224, 224)):
#         super().__init__()
#         self.features = nn.Sequential(
#             nn.Conv2d(in_channels, 32, kernel_size=3, padding=1),
#             nn.ReLU(),
#             nn.MaxPool2d(2),
#             nn.Conv2d(32, 64, kernel_size=3, padding=1),
#             nn.ReLU(),
#             nn.MaxPool2d(2),
#         )
#         # compute flatten size using a dummy tensor
#         with torch.no_grad():
#             dummy = torch.zeros(1, *input_size)
#             feat = self.features(dummy)
#             # flat_features was previously computed as:
#             #   int(feat.numel() / feat.shape[0])
#             # Explanation:
#             #   feat.shape == (N, C, H, W)  (for image inputs)
#             #   feat.numel() == N * C * H * W
#             #   dividing by N (feat.shape[0]) yields C * H * W, i.e. flattened size per sample
#             # Clearer alternative using tensor shape:
#             flat_features = int(torch.prod(torch.tensor(feat.shape[1:])).item())
#             # If you need the linear index mapping for coordinates (c, h, w):
#             #   idx = c * (H * W) + h * W + w

#         self.classifier = nn.Sequential(
#             nn.Flatten(),
#             nn.Linear(flat_features, 256),
#             nn.ReLU(),
#             nn.Dropout(0.5),
#             nn.Linear(256, num_classes),
#         )

#     def forward(self, x):
#         x = self.features(x)
#         x = self.classifier(x)
#         return x


# class MLP(nn.Module):
#     """Simple MLP for tabular CSV data classification."""
#     def __init__(self, input_dim, hidden_dims=(256, 128), num_classes=2):
#         super().__init__()
#         layers = []
#         prev = input_dim
#         for h in hidden_dims:
#             layers.append(nn.Linear(prev, h))
#             layers.append(nn.ReLU())
#             layers.append(nn.Dropout(0.2))
#             prev = h
#         layers.append(nn.Linear(prev, num_classes))
#         self.net = nn.Sequential(*layers)

#     def forward(self, x):
#         return self.net(x)


# def create_model(device=None, in_channels=3, num_classes=10, input_size=(3, 224, 224), model_type='cnn', input_dim=None, hidden_dims=None):
#     if model_type == 'mlp':
#         if input_dim is None:
#             raise ValueError('input_dim is required for mlp model_type')
#         if hidden_dims is None:
#             model = MLP(input_dim=input_dim, num_classes=num_classes)
#         else:
#             model = MLP(input_dim=input_dim, hidden_dims=hidden_dims, num_classes=num_classes)
#     else:
#         model = SimpleCNN(in_channels=in_channels, num_classes=num_classes, input_size=input_size)

#     if device:
#         model.to(device)
#     return model

import torch
import torch.nn as nn
import math
from typing import Union, Iterable
import numpy as np
import os

# Retaining the existing `accidents_to_bucket` function for accident categorization
def accidents_to_bucket(count: Union[int, float, Iterable],
                        max_count: int = 20000,
                        num_bins: int = 10) -> Union[int, list, torch.Tensor, np.ndarray]:
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
    if isinstance(count, torch.Tensor):
        x = count.clone().float()
        x = torch.clamp(x, min=0.0, max=float(max_count))
        buckets = (x // width).to(torch.long) + 1
        buckets = torch.clamp(buckets, min=1, max=num_bins)
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


# SimpleCNN: CNN model for image classification
class SimpleCNN(nn.Module):
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
        with torch.no_grad():
            dummy = torch.zeros(1, *input_size)
            feat = self.features(dummy)
            flat_features = int(torch.prod(torch.tensor(feat.shape[1:])).item())
        
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
    def __init__(self, input_dim=58, hidden_dims=(1024, 512, 50), num_classes=10):
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


def load_model(model_path, model_class, input_dim=None):
    """
    Load the model weights from the given path and initialize the model class.

    Behavior:
    - If the checkpoint contains 'model_config', use it to build the model.
    - Otherwise infer input_dim / hidden_dims / num_classes from the state_dict shapes.
    - model_class must be MLP or SimpleCNN; for MLP input_dim may be inferred if not provided.
    """
    import torch
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"model file not found: {model_path}")

    ckpt = torch.load(model_path, map_location=torch.device('cpu'))

    # locate state dict
    state = None
    for k in ('model_state_dict', 'state_dict', 'model'):
        if k in ckpt and isinstance(ckpt[k], dict):
            state = ckpt[k]
            break
    if state is None:
        # maybe the file directly contains the state_dict
        if isinstance(ckpt, dict) and any(k.endswith('.weight') for k in ckpt.keys()):
            state = ckpt
        else:
            raise ValueError("No state_dict found in checkpoint")

    # prefer explicit model_config if present
    model_config = ckpt.get('model_config') or ckpt.get('config') or {}

    # helper to infer MLP params from state_dict if no config provided
    def _infer_mlp_from_state(state_dict):
        # collect net.*.weight keys (MLP uses 'net' module)
        weight_items = []
        for k in state_dict.keys():
            if k.endswith('.weight') and k.startswith('net.'):
                try:
                    idx = int(k.split('.')[1])
                except Exception:
                    continue
                weight_items.append((idx, k))
        if not weight_items:
            # fallback: take all weight-like keys in order
            weight_items = [(i, k) for i, k in enumerate(sorted([k for k in state_dict.keys() if k.endswith('.weight')]))]
        weight_items.sort()
        shapes = [tuple(state_dict[k].shape) for _, k in weight_items]
        # shapes are (out, in) for each Linear
        if not shapes:
            raise ValueError("Cannot infer MLP structure from state_dict")
        input_dim_inferred = int(shapes[0][1])
        hidden_dims_inferred = [int(s[0]) for s in shapes[:-1]]  # all but last are hidden layer outputs
        num_classes_inferred = int(shapes[-1][0])
        return input_dim_inferred, tuple(hidden_dims_inferred), num_classes_inferred

    # instantiate model
    if model_class == MLP:
        # prefer values from model_config
        cfg_input_dim = model_config.get('input_dim')
        cfg_hidden = model_config.get('hidden_dims') or model_config.get('hidden_dim') or model_config.get('hidden')
        cfg_num_classes = model_config.get('num_classes')

        use_input_dim = input_dim or cfg_input_dim
        use_hidden = cfg_hidden
        use_num_classes = cfg_num_classes

        if use_input_dim is None or use_num_classes is None:
            # infer from state
            inferred_input, inferred_hidden, inferred_num = _infer_mlp_from_state(state)
            if use_input_dim is None:
                use_input_dim = inferred_input
            if use_hidden is None:
                use_hidden = inferred_hidden
            if use_num_classes is None:
                use_num_classes = inferred_num

        # normalize hidden dims to tuple if needed
        if use_hidden is None:
            use_hidden = (256, 128)
        elif isinstance(use_hidden, (list, tuple)):
            use_hidden = tuple(use_hidden)
        else:
            # sometimes stored as string
            try:
                use_hidden = tuple(int(x) for x in str(use_hidden).strip('()[]').split(',') if x)
            except Exception:
                use_hidden = (256, 128)

        model = MLP(input_dim=int(use_input_dim), hidden_dims=use_hidden, num_classes=int(use_num_classes))

    elif model_class == SimpleCNN:
        # use model_config if present
        cfg_num_classes = model_config.get('num_classes') or 10
        cfg_input_size = model_config.get('input_size') or (3, 224, 224)
        model = SimpleCNN(in_channels=cfg_input_size[0], num_classes=int(cfg_num_classes), input_size=tuple(cfg_input_size))
    else:
        raise ValueError(f"Unsupported model class: {model_class}")

    # load weights into model
    try:
        model.load_state_dict(state)
    except Exception as e:
        # provide helpful diagnostics
        model_keys = list(model.state_dict().keys())[:50]
        state_keys = list(state.keys())[:50]
        raise RuntimeError(f"Failed to load state_dict: {e}. model_keys_sample={model_keys}, state_keys_sample={state_keys}")

    return model

# Helper function to create different types of models
def create_model(device=None, in_channels=3, num_classes=10, input_size=(3, 224, 224), model_type='cnn', input_dim=None, hidden_dims=None):
    """
    Creates and returns a model based on the provided configuration.
    
    Args:
      device (str or torch.device, optional): The device to run the model on ('cpu' or 'cuda').
      in_channels (int, optional): The number of input channels (default 3 for RGB images).
      num_classes (int, optional): The number of output classes (default 10).
      input_size (tuple, optional): The input size for the model (default (3, 224, 224)).
      model_type (str, optional): The type of model ('cnn' for convolutional, 'mlp' for multi-layer perceptron).
      input_dim (int, optional): The input dimension for the MLP (used only if `model_type == 'mlp'`).
      hidden_dims (tuple, optional): The dimensions of hidden layers for the MLP (used only if `model_type == 'mlp'`).
    
    Returns:
      model (nn.Module): The created model.
    """
    if model_type == 'mlp':
        if input_dim is None:
            raise ValueError('input_dim is required for mlp model_type')
        model = MLP(input_dim=input_dim, hidden_dims=hidden_dims or (256, 128), num_classes=num_classes)
    else:
        model = SimpleCNN(in_channels=in_channels, num_classes=num_classes, input_size=input_size)

    if device:
        model.to(device)
    return model


# Example for using load_model and create_model in the codebase:

# Loading a model
# model = load_model('path_to_model.pth', SimpleCNN, device='cuda')

# Creating a model for inference
# model = create_model(device='cuda', model_type='cnn', num_classes=5)