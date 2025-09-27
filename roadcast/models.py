import torch
import torch.nn as nn


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
            flat_features = int(feat.numel() / feat.shape[0])

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
