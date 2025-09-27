import pandas as pd
import hashlib
from data import _normalize_str, _normalize_date

p='data.csv'
df=pd.read_csv(p, nrows=50, low_memory=False)
print('Columns:', list(df.columns))

colmap = {c.lower(): c for c in df.columns}

def get_col(*candidates):
    for cand in candidates:
        key = cand.lower()
        if key in colmap:
            return colmap[key]
    return None

report_col = get_col('report_dat', 'reportdate', 'fromdate', 'lastupdatedate')
lat_col = get_col('latitude', 'mpdlatitude', 'lat')
lon_col = get_col('longitude', 'mpdlongitude', 'lon')
street1_col = get_col('street1', 'address', 'mar_address', 'nearestintstreetname')
street2_col = get_col('street2', 'nearestintstreetname')
ward_col = get_col('ward')
inj_cols = [c for c in df.columns if 'INJUR' in c.upper()]
fat_cols = [c for c in df.columns if 'FATAL' in c.upper()]
uid = get_col('crimeid', 'eventid', 'objectid', 'ccn')

print('Resolved columns:')
print('report_col=', report_col)
print('lat_col=', lat_col)
print('lon_col=', lon_col)
print('street1_col=', street1_col)
print('street2_col=', street2_col)
print('ward_col=', ward_col)
print('inj_cols=', inj_cols[:10])
print('fat_cols=', fat_cols[:10])
print('uid=', uid)

for i, row in df.iterrows():
    parts = []
    parts.append(_normalize_date(row.get(report_col, '') if report_col else ''))
    lat = row.get(lat_col, '') if lat_col else ''
    lon = row.get(lon_col, '') if lon_col else ''
    try:
        parts.append(str(round(float(lat), 5)) if pd.notna(lat) and lat != '' else '')
    except Exception:
        parts.append('')
    try:
        parts.append(str(round(float(lon), 5)) if pd.notna(lon) and lon != '' else '')
    except Exception:
        parts.append('')
    parts.append(_normalize_str(row.get(street1_col, '') if street1_col else ''))
    parts.append(_normalize_str(row.get(street2_col, '') if street2_col else ''))
    parts.append(_normalize_str(row.get(ward_col, '') if ward_col else ''))
    inj_sum = 0
    for c in inj_cols:
        try:
            v = row.get(c, 0)
            inj_sum += int(v) if pd.notna(v) and v != '' else 0
        except Exception:
            pass
    parts.append(str(inj_sum))
    fat_sum = 0
    for c in fat_cols:
        try:
            v = row.get(c, 0)
            fat_sum += int(v) if pd.notna(v) and v != '' else 0
        except Exception:
            pass
    parts.append(str(fat_sum))
    if uid:
        parts.append(str(row.get(uid, '')))
    s='|'.join(parts)
    h=hashlib.md5(s.encode('utf-8')).hexdigest()
    val=int(h,16)%100
    print(i, 'label=', val, 's="'+s+'"')
