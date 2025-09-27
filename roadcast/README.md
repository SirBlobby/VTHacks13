# RoAdCast - Flask + PyTorch CNN starter

This project contains a minimal Flask app and a small PyTorch CNN scaffold so you can train and run a model directly from VS Code.

Quick setup (Windows PowerShell):

1. Create and activate a virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install dependencies

```powershell
pip install -r requirements.txt
```


3. Dataset layout

Image dataset (folder-per-class):

data/
  class1/
    img1.jpg
  class2/
    img2.jpg

CSV dataset (single file):

data.csv  (expects a `label` column and numeric feature columns)

Train commands:

Image training (default cnn):

```powershell
python train.py data --epochs 5 --batch-size 16
```

CSV/tabular training (MLP):

```powershell
python train.py data.csv --model-type mlp --epochs 20 --batch-size 64
```

The model will be saved as `model.pth` in the repo root (best validation checkpoint).

Run the Flask app (for local testing):

```powershell
python app.py
```

Predict using curl (or Postman). Example with curl in PowerShell:

```powershell
curl -X POST -F "image=@path\to\image.jpg" http://127.0.0.1:5000/predict
```

VS Code tips

- Open this folder in VS Code.
- Use the Python extension and select the `.venv` interpreter.
- Use the Run panel to add a launch configuration that runs `app.py` or `train.py`.
- For long training runs, run training in the terminal (not the debugger) and monitor logs.

Notes & next steps

- The SimpleCNN uses 224x224 input and expects at least two maxpool steps; adjust `models.py` if you want smaller inputs.
- Add better transforms and augmentation in `data.py` for better performance.
- If GPU is available, PyTorch will use it automatically if installed with CUDA.
