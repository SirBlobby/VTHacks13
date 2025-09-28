import pandas as pd
from pymongo import MongoClient
from datetime import datetime
import os
from dotenv import load_dotenv
import numpy as np

# Load environment variables
load_dotenv('.env.local')

# MongoDB connection
MONGO_URI = os.getenv('MONGO_URI')
client = MongoClient(MONGO_URI)
db = client['crashes']
collection = db['crashes']

# Read CSV
print("Reading CSV file...")
df = pd.read_csv('Crashes_in_DC.csv')
print(f"Loaded {len(df)} crash records")

# Helper to calculate severity based on injury data
def calculate_severity(row):
    # Count total injuries and fatalities
    fatal_count = (
        row.get('FATAL_BICYCLIST', 0) + 
        row.get('FATAL_DRIVER', 0) + 
        row.get('FATAL_PEDESTRIAN', 0) + 
        row.get('FATALPASSENGER', 0) + 
        row.get('FATALOTHER', 0)
    )
    
    major_injury_count = (
        row.get('MAJORINJURIES_BICYCLIST', 0) + 
        row.get('MAJORINJURIES_DRIVER', 0) + 
        row.get('MAJORINJURIES_PEDESTRIAN', 0) + 
        row.get('MAJORINJURIESPASSENGER', 0) + 
        row.get('MAJORINJURIESOTHER', 0)
    )
    
    minor_injury_count = (
        row.get('MINORINJURIES_BICYCLIST', 0) + 
        row.get('MINORINJURIES_DRIVER', 0) + 
        row.get('MINORINJURIES_PEDESTRIAN', 0) + 
        row.get('MINORINJURIESPASSENGER', 0) + 
        row.get('MINORINJURIESOTHER', 0)
    )
    
    if fatal_count > 0:
        return "Fatal"
    elif major_injury_count > 0:
        return "Major Injury"
    elif minor_injury_count > 0:
        return "Minor Injury"
    else:
        return "Property Damage Only"

# Helper to convert row to MongoDB document
def row_to_doc(row):
    # Handle missing coordinates
    longitude = row.get('LONGITUDE')
    latitude = row.get('LATITUDE')
    
    # Skip records with invalid coordinates
    if pd.isna(longitude) or pd.isna(latitude) or longitude == 0 or latitude == 0:
        return None
    
    # Parse date
    report_date = None
    if pd.notna(row.get('REPORTDATE')):
        try:
            report_date = pd.to_datetime(row['REPORTDATE'])
        except:
            report_date = None
    
    # Build the document with GeoJSON location
    doc = {
        "crashId": str(row.get('CRIMEID', '')),
        "ccn": str(row.get('CCN', '')),
        "reportDate": report_date,
        "location": {
            "type": "Point",
            "coordinates": [float(longitude), float(latitude)]  # [longitude, latitude]
        },
        "address": str(row.get('ADDRESS', '')),
        "severity": calculate_severity(row),
        "ward": str(row.get('WARD', '')),
        "vehicles": {
            "total": int(row.get('TOTAL_VEHICLES', 0)),
            "taxis": int(row.get('TOTAL_TAXIS', 0)),
            "government": int(row.get('TOTAL_GOVERNMENT', 0))
        },
        "casualties": {
            "bicyclists": {
                "fatal": int(row.get('FATAL_BICYCLIST', 0)),
                "major_injuries": int(row.get('MAJORINJURIES_BICYCLIST', 0)),
                "minor_injuries": int(row.get('MINORINJURIES_BICYCLIST', 0)),
                "unknown_injuries": int(row.get('UNKNOWNINJURIES_BICYCLIST', 0)),
                "total": int(row.get('TOTAL_BICYCLES', 0))
            },
            "drivers": {
                "fatal": int(row.get('FATAL_DRIVER', 0)),
                "major_injuries": int(row.get('MAJORINJURIES_DRIVER', 0)),
                "minor_injuries": int(row.get('MINORINJURIES_DRIVER', 0)),
                "unknown_injuries": int(row.get('UNKNOWNINJURIES_DRIVER', 0))
            },
            "pedestrians": {
                "fatal": int(row.get('FATAL_PEDESTRIAN', 0)),
                "major_injuries": int(row.get('MAJORINJURIES_PEDESTRIAN', 0)),
                "minor_injuries": int(row.get('MINORINJURIES_PEDESTRIAN', 0)),
                "unknown_injuries": int(row.get('UNKNOWNINJURIES_PEDESTRIAN', 0)),
                "total": int(row.get('TOTAL_PEDESTRIANS', 0))
            },
            "passengers": {
                "fatal": int(row.get('FATALPASSENGER', 0)),
                "major_injuries": int(row.get('MAJORINJURIESPASSENGER', 0)),
                "minor_injuries": int(row.get('MINORINJURIESPASSENGER', 0)),
                "unknown_injuries": int(row.get('UNKNOWNINJURIESPASSENGER', 0))
            }
        },
        "circumstances": {
            "speeding_involved": bool(row.get('SPEEDING_INVOLVED', False)),
            "pedestrians_impaired": bool(row.get('PEDESTRIANSIMPAIRED', False)),
            "bicyclists_impaired": bool(row.get('BICYCLISTSIMPAIRED', False)),
            "drivers_impaired": bool(row.get('DRIVERSIMPAIRED', False))
        },
        "location_details": {
            "nearest_intersection": str(row.get('NEARESTINTSTREETNAME', '')),
            "off_intersection": bool(row.get('OFFINTERSECTION', False)),
            "approach_direction": str(row.get('INTAPPROACHDIRECTION', ''))
        }
    }
    
    return doc

# Convert all rows to documents
print("Converting data to MongoDB documents...")
docs = []
skipped_count = 0

for _, row in df.iterrows():
    doc = row_to_doc(row)
    if doc is not None:
        docs.append(doc)
    else:
        skipped_count += 1

print(f"Converted {len(docs)} valid documents")
print(f"Skipped {skipped_count} records with invalid coordinates")

# Insert into MongoDB in batches
print("Inserting documents into MongoDB...")
batch_size = 1000
total_inserted = 0

for i in range(0, len(docs), batch_size):
    batch = docs[i:i+batch_size]
    try:
        result = collection.insert_many(batch, ordered=False)
        total_inserted += len(result.inserted_ids)
        print(f"Inserted batch {i//batch_size + 1}/{(len(docs) + batch_size - 1)//batch_size} - Total: {total_inserted}")
    except Exception as e:
        print(f"Error inserting batch: {e}")

print(f"Successfully inserted {total_inserted} documents")

# Create 2dsphere index for geospatial queries
print("Creating 2dsphere index for geospatial queries...")
try:
    collection.create_index([("location", "2dsphere")])
    print("Successfully created 2dsphere index on 'location' field")
except Exception as e:
    print(f"Error creating index: {e}")

# Create additional indexes for common queries
print("Creating additional indexes...")
try:
    collection.create_index([("severity", 1)])
    collection.create_index([("reportDate", 1)])
    collection.create_index([("ward", 1)])
    print("Successfully created additional indexes")
except Exception as e:
    print(f"Error creating additional indexes: {e}")

print("Data import completed!")

# Sample geospatial query to test
print("\n--- Testing geospatial query ---")
try:
    # Find crashes within 1000 meters of a point in DC
    sample_point = [-77.0369, 38.9072]  # Washington DC coordinates
    nearby_crashes = collection.find({
        "location": {
            "$nearSphere": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": sample_point
                },
                "$maxDistance": 1000  # 1000 meters
            }
        }
    }).limit(5)
    
    print(f"Sample query: Found crashes within 1000m of {sample_point}:")
    for crash in nearby_crashes:
        print(f"  - Crash ID: {crash['crashId']}, Address: {crash['address']}, Severity: {crash['severity']}")
        
except Exception as e:
    print(f"Error running sample query: {e}")

client.close()