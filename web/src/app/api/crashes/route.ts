import { NextRequest, NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

export type CrashData = {
  id: string;
  latitude: number;
  longitude: number;
  reportDate: string;
  address: string;
  ward: string;
  totalVehicles: number;
  totalPedestrians: number;
  totalBicycles: number;
  fatalDriver: number;
  fatalPedestrian: number;
  fatalBicyclist: number;
  majorInjuriesDriver: number;
  majorInjuriesPedestrian: number;
  majorInjuriesBicyclist: number;
  speedingInvolved: number;
};

export type CrashResponse = {
  data: CrashData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

// MongoDB connection
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

async function loadCrashData(page: number, limit: number, yearFilter?: string): Promise<{ data: CrashData[]; total: number }> {
  try {
    const mongoClient = await getMongoClient();
    const db = mongoClient.db(process.env.DATABASE_NAME || 'crashes');
    const collection = db.collection(process.env.COLLECTION_NAME || 'crashes');
    
    // Build date filter
    let dateFilter: any = { $gte: new Date('2020-01-01T00:00:00.000Z') };
    
    if (yearFilter) {
      const year = parseInt(yearFilter);
      if (!isNaN(year)) {
        dateFilter = {
          $gte: new Date(`${year}-01-01T00:00:00.000Z`),
          $lt: new Date(`${year + 1}-01-01T00:00:00.000Z`)
        };
      }
    }
    
    // Base query for valid records
    const baseQuery = {
      'location.coordinates': { $exists: true, $ne: null, $size: 2 },
      'location.coordinates.0': { $ne: null, $type: 'number' },
      'location.coordinates.1': { $ne: null, $type: 'number' },
      crashId: { $exists: true, $nin: [null, ''] },
      reportDate: dateFilter
    };
    
    // Get total count for pagination
    const total = await collection.countDocuments(baseQuery);
    
    // Calculate skip value
    const skip = (page - 1) * limit;
    
    // Query MongoDB with pagination
    const crashes = await collection.find(baseQuery,
      {
        projection: {
          _id: 1,
          crashId: 1,
          'location.coordinates': 1,
          reportDate: 1,
          address: 1,
          ward: 1,
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
    .skip(skip)
    .limit(limit)
    .toArray();
    
    // Transform MongoDB documents to CrashData format
    const transformedData: CrashData[] = crashes
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
      .filter((crash): crash is CrashData => crash !== null); // Filter out null entries
    
    return { data: transformedData, total };
  } catch (error) {
    console.error('Error loading crash data from MongoDB:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(10000, Math.max(1, parseInt(searchParams.get('limit') || '100')));
    const year = searchParams.get('year') || undefined;
    
    // Load crash data from MongoDB
    const { data: pageData, total } = await loadCrashData(page, limit, year);
    
    // Calculate pagination
    const totalPages = Math.ceil(total / limit);
    
    const response: CrashResponse = {
      data: pageData,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error loading crash data:', error);
    return NextResponse.json(
      { error: 'Failed to load crash data from database' },
      { status: 500 }
    );
  }
}