import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

// MongoDB connection (reuse from main route)
let client: MongoClient | null = null;

async function getMongoClient(): Promise<MongoClient> {
  if (!client) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    client = new MongoClient(uri);
    await client.connect();
  }
  return client;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lng = parseFloat(searchParams.get('lng') || '0');
    const lat = parseFloat(searchParams.get('lat') || '0');
    const radius = parseInt(searchParams.get('radius') || '1000'); // Default 1km radius
    const limit = Math.min(1000, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    
    if (!lng || !lat) {
      return NextResponse.json(
        { error: 'longitude (lng) and latitude (lat) parameters are required' },
        { status: 400 }
      );
    }
    
    const mongoClient = await getMongoClient();
    const db = mongoClient.db(process.env.DATABASE_NAME || 'crashes');
    const collection = db.collection(process.env.COLLECTION_NAME || 'crashes');
    
    // Create date filter for 2020 onwards - only show recent crash data
    const dateFrom2020 = new Date('2020-01-01T00:00:00.000Z');
    
    // Perform geospatial query using $nearSphere with null data filtering and date filter
    const crashes = await collection.find(
      {
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [lng, lat]
            },
            $maxDistance: radius
          }
        },
        // Additional filters to exclude null/invalid data and only include 2020+
        'location.coordinates': { $exists: true, $ne: null, $size: 2 },
        'location.coordinates.0': { $ne: null, $type: 'number' },
        'location.coordinates.1': { $ne: null, $type: 'number' },
        crashId: { $exists: true, $nin: [null, ''] },
        reportDate: { $gte: dateFrom2020 }
      },
      {
        projection: {
          _id: 1,
          crashId: 1,
          'location.coordinates': 1,
          reportDate: 1,
          address: 1,
          ward: 1,
          severity: 1,
          'vehicles.total': 1,
          'casualties.pedestrians.total': 1,
          'casualties.bicyclists.total': 1,
          'casualties.drivers.fatal': 1,
          'casualties.pedestrians.fatal': 1,
          'casualties.bicyclists.fatal': 1,
          'casualties.drivers.major_injuries': 1,
          'casualties.pedestrians.major_injuries': 1,
          'casualties.bicyclists.major_injuries': 1,
          'circumstances.speeding_involved': 1
        }
      }
    )
    .limit(limit)
    .toArray();
    
    // Transform MongoDB documents to a more frontend-friendly format
    const transformedData = crashes
      .map((doc: any) => {
        // Skip documents with invalid coordinates
        const coords = doc.location?.coordinates;
        if (!coords || !Array.isArray(coords) || coords.length !== 2) {
          return null;
        }
        
        const lng = coords[0];
        const lat = coords[1];
        
        if (typeof lng !== 'number' || typeof lat !== 'number' || 
            lng === 0 || lat === 0 || isNaN(lng) || isNaN(lat)) {
          return null;
        }
        
        return {
          id: doc.crashId || doc._id.toString(),
          latitude: lat,
          longitude: lng,
          reportDate: doc.reportDate ? new Date(doc.reportDate).toISOString() : '',
          address: doc.address || '',
          ward: doc.ward || '',
          severity: doc.severity || 'Unknown',
          totalVehicles: doc.vehicles?.total || 0,
          totalPedestrians: doc.casualties?.pedestrians?.total || 0,
          totalBicycles: doc.casualties?.bicyclists?.total || 0,
          fatalDriver: doc.casualties?.drivers?.fatal || 0,
          fatalPedestrian: doc.casualties?.pedestrians?.fatal || 0,
          fatalBicyclist: doc.casualties?.bicyclists?.fatal || 0,
          majorInjuriesDriver: doc.casualties?.drivers?.major_injuries || 0,
          majorInjuriesPedestrian: doc.casualties?.pedestrians?.major_injuries || 0,
          majorInjuriesBicyclist: doc.casualties?.bicyclists?.major_injuries || 0,
          speedingInvolved: doc.circumstances?.speeding_involved ? 1 : 0,
        };
      })
      .filter((crash): crash is NonNullable<typeof crash> => crash !== null); // Filter out null entries
    
    return NextResponse.json({
      data: transformedData,
      query: {
        center: [lng, lat],
        radiusMeters: radius,
        resultsCount: transformedData.length
      }
    });
    
  } catch (error) {
    console.error('Error performing geospatial query:', error);
    return NextResponse.json(
      { error: 'Failed to perform geospatial query' },
      { status: 500 }
    );
  }
}