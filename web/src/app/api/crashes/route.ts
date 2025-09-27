import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';

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

const CSV_FILE_PATH = path.join(process.cwd(), 'public', 'Crashes_in_DC.csv');

// Cache to store parsed CSV data
let csvCache: CrashData[] | null = null;
let csvCacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function loadCsvData(): Promise<CrashData[]> {
  const now = Date.now();
  
  // Return cached data if it's still valid
  if (csvCache && (now - csvCacheTimestamp) < CACHE_TTL) {
    return csvCache;
  }

  return new Promise((resolve, reject) => {
    const results: CrashData[] = [];
    
    if (!fs.existsSync(CSV_FILE_PATH)) {
      reject(new Error('CSV file not found'));
      return;
    }

    fs.createReadStream(CSV_FILE_PATH)
      .pipe(csv())
      .on('data', (row: any) => {
        // Parse the CSV row and extract relevant fields
        const latitude = parseFloat(row.LATITUDE);
        const longitude = parseFloat(row.LONGITUDE);
        
        // Only include rows with valid coordinates
        if (!isNaN(latitude) && !isNaN(longitude) && latitude && longitude) {
          results.push({
            id: row.OBJECTID || row.CRIMEID || `crash-${results.length}`,
            latitude,
            longitude,
            reportDate: row.REPORTDATE || '',
            address: row.ADDRESS || '',
            ward: row.WARD || '',
            totalVehicles: parseInt(row.TOTAL_VEHICLES) || 0,
            totalPedestrians: parseInt(row.TOTAL_PEDESTRIANS) || 0,
            totalBicycles: parseInt(row.TOTAL_BICYCLES) || 0,
            fatalDriver: parseInt(row.FATAL_DRIVER) || 0,
            fatalPedestrian: parseInt(row.FATAL_PEDESTRIAN) || 0,
            fatalBicyclist: parseInt(row.FATAL_BICYCLIST) || 0,
            majorInjuriesDriver: parseInt(row.MAJORINJURIES_DRIVER) || 0,
            majorInjuriesPedestrian: parseInt(row.MAJORINJURIES_PEDESTRIAN) || 0,
            majorInjuriesBicyclist: parseInt(row.MAJORINJURIES_BICYCLIST) || 0,
            speedingInvolved: parseInt(row.SPEEDING_INVOLVED) || 0,
          });
        }
      })
      .on('end', () => {
        // Update cache
        csvCache = results;
        csvCacheTimestamp = now;
        resolve(results);
      })
      .on('error', (error: any) => {
        reject(error);
      });
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(10000, Math.max(1, parseInt(searchParams.get('limit') || '100')));
    
    // Load CSV data
    const allCrashes = await loadCsvData();
    
    // Calculate pagination
    const total = allCrashes.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    // Get the page data
    const pageData = allCrashes.slice(startIndex, endIndex);
    
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
      { error: 'Failed to load crash data' },
      { status: 500 }
    );
  }
}