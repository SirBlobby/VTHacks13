import sys
import importlib

def safe_import(name):
    try:
        return importlib.import_module(name)
    except Exception as e:
        return e

print('Python:', sys.version.replace('\n',' '))

torch = safe_import('torch')
if isinstance(torch, Exception):
    print('torch import error:', torch)
else:
    print('torch:', torch.__version__)
    print('CUDA available:', torch.cuda.is_available())
    if torch.cuda.is_available():
        print('CUDA device count:', torch.cuda.device_count())
        print('Current device name:', torch.cuda.get_device_name(0))

pandas = safe_import('pandas')
if isinstance(pandas, Exception):
    print('pandas import error:', pandas)
else:
    print('pandas:', pandas.__version__)

try:
    import sklearn
    print('sklearn:', sklearn.__version__)
except Exception:
    pass
