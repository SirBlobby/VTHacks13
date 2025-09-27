import os
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms

from models import create_model


def load_model(path, device=None, in_channels=3, num_classes=10):
    device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
    checkpoint = torch.load(path, map_location=device)
    model = create_model(device=device, in_channels=in_channels, num_classes=num_classes)
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()
    class_to_idx = checkpoint.get('class_to_idx')
    idx_to_class = {v: k for k, v in class_to_idx.items()} if class_to_idx else None
    return model, idx_to_class


def predict_image(model, img_path, device=None):
    device = device or ('cuda' if torch.cuda.is_available() else 'cpu')
    preprocess = transforms.Compose([transforms.Resize((224, 224)), transforms.ToTensor()])
    img = Image.open(img_path).convert('RGB')
    x = preprocess(img).unsqueeze(0).to(device)
    with torch.no_grad():
        logits = model(x)
        probs = F.softmax(logits, dim=1)
        conf, idx = torch.max(probs, dim=1)
    return int(idx.item()), float(conf.item())
