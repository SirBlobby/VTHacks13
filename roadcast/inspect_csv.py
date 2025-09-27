import pandas as pd

p = 'data.csv'
print('Reading first 2000 rows of', p)
df = pd.read_csv(p, nrows=2000, low_memory=False)
print('Columns:', list(df.columns))
cols = ['report_dat','latitude','longitude','street1','street2','ward','injuries','fatalities']
print('\nField stats for label-generator columns:')
for c in cols:
    if c in df.columns:
        ser = df[c]
        try:
            unique = ser.dropna().unique()[:5].tolist()
        except Exception:
            unique = []
        print(f"{c}: present dtype={ser.dtype} n_unique={ser.nunique(dropna=False)} n_null={int(ser.isna().sum())} sample_values={unique}")
    else:
        print(f"{c}: MISSING")

# If labels already present, show distribution
if 'label' in df.columns:
    print('\nLabel column present in sample:')
    print(df['label'].value_counts().head(20))
else:
    print('\nLabel column not present in sample')

# Also show per-column fraction NaN for numeric columns
num_cols = df.select_dtypes(include=['number']).columns.tolist()
print('\nNumeric columns and NaN fraction (first 20):')
for c in num_cols[:20]:
    ser = df[c]
    print(f"{c}: n={len(ser)} null_frac={ser.isna().mean():.4f} min={ser.min()} max={ser.max()}")

print('\nDone')
