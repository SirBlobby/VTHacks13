import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv('.env.local')

# MongoDB connection
MONGO_URI = os.getenv('MONGO_URI')
client = MongoClient(MONGO_URI)
db = client['crashes']
collection = db['crashes']

print("=== MongoDB Geospatial Query Examples ===\n")

# 1. Count total documents
print("1. Total crash records in database:")
total_count = collection.count_documents({})
print(f"   {total_count} crash records\n")

# 2. Find crashes within a radius (near the White House)
print("2. Crashes within 500 meters of the White House:")
white_house = [-77.0365, 38.8977]
nearby_crashes = list(collection.find({
    "location": {
        "$nearSphere": {
            "$geometry": {
                "type": "Point",
                "coordinates": white_house
            },
            "$maxDistance": 500  # 500 meters
        }
    }
}).limit(5))

for crash in nearby_crashes:
    print(f"   - {crash['crashId']}: {crash['address']} (Severity: {crash['severity']})")
print()

# 3. Find crashes within a bounding box (downtown DC area)
print("3. Crashes within downtown DC bounding box:")
downtown_crashes = list(collection.find({
    "location": {
        "$geoWithin": {
            "$box": [
                [-77.05, 38.88],  # Southwest corner
                [-77.01, 38.92]   # Northeast corner  
            ]
        }
    }
}).limit(5))

for crash in downtown_crashes:
    print(f"   - {crash['crashId']}: {crash['address']} (Ward: {crash['ward']})")
print()

# 4. Aggregation with geoNear for fatal crashes
print("4. Fatal crashes near Capitol Hill (within 1km):")
capitol_hill = [-77.0090, 38.8899]
fatal_nearby = list(collection.aggregate([
    {
        "$geoNear": {
            "near": {
                "type": "Point",
                "coordinates": capitol_hill
            },
            "distanceField": "distance",
            "maxDistance": 1000,
            "query": {"severity": "Fatal"},
            "spherical": True
        }
    },
    {"$limit": 3}
]))

for crash in fatal_nearby:
    distance_m = round(crash['distance'])
    print(f"   - {crash['crashId']}: {crash['address']} ({distance_m}m away)")
print()

# 5. Count crashes by severity within a specific area
print("5. Crash severity breakdown in Ward 1:")
severity_breakdown = list(collection.aggregate([
    {"$match": {"ward": "Ward 1"}},
    {"$group": {"_id": "$severity", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}}
]))

for item in severity_breakdown:
    print(f"   - {item['_id']}: {item['count']} crashes")
print()

# 6. Find crashes involving speeding within a polygon area
print("6. Speeding-involved crashes near DuPont Circle:")
dupont_circle = [-77.0436, 38.9094]
speeding_crashes = list(collection.find({
    "location": {
        "$nearSphere": {
            "$geometry": {
                "type": "Point",
                "coordinates": dupont_circle
            },
            "$maxDistance": 800
        }
    },
    "circumstances.speeding_involved": True
}).limit(3))

for crash in speeding_crashes:
    print(f"   - {crash['crashId']}: {crash['address']}")
    print(f"     Vehicles: {crash['vehicles']['total']}, Severity: {crash['severity']}")
print()

print("=== Geospatial queries completed successfully! ===")

client.close()