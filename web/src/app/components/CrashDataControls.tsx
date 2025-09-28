"use client";

import React, { useState } from 'react';
import { UseCrashDataResult } from '../hooks/useCrashData';

interface CrashDataControlsProps {
  crashDataHook: UseCrashDataResult;
  onDataLoaded?: (dataCount: number) => void;
}

export default function CrashDataControls({ crashDataHook, onDataLoaded }: CrashDataControlsProps) {
  const { data, loading, error, pagination, loadMore, refresh, yearFilter, setYearFilter } = crashDataHook;
  const currentYear = new Date().getFullYear().toString();
  const [selectedYear, setSelectedYear] = useState<string>(yearFilter || currentYear);

  React.useEffect(() => {
    if (onDataLoaded) {
      onDataLoaded(data.length);
    }
  }, [data.length, onDataLoaded]);

  // Get available years (current year and previous 5 years)
  const getAvailableYears = () => {
    const currentYear = new Date().getFullYear();
    const years: string[] = [];
    
    // Add current year and previous 5 years
    for (let year = currentYear; year >= currentYear - 5; year--) {
      years.push(year.toString());
    }
    
    return years;
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    const filterYear = year === 'all' ? null : year;
    if (setYearFilter) {
      setYearFilter(filterYear);
    }
  };

  React.useEffect(() => {
    if (onDataLoaded) {
      onDataLoaded(data.length);
    }
  }, [data.length, onDataLoaded]);

  return (
    <div style={{
      position: 'absolute',
      bottom: '320px', // Position above the map controls panel with some margin
      right: '12px',   // Align with map controls panel
      backgroundColor: 'rgba(26, 26, 26, 0.95)', // Match the map controls styling more closely
      color: 'white',
      padding: '12px',
      borderRadius: '10px', // Match map controls border radius
      zIndex: 30,
      fontSize: '13px',    // Match map controls font size
      width: '240px',      // Match map controls width
      backdropFilter: 'blur(8px)', // Match map controls backdrop filter
      border: '1px solid rgba(64, 64, 64, 0.5)', // Add subtle border
      boxShadow: '0 6px 18px rgba(0,0,0,0.15)' // Match map controls shadow
    }}>
      <div style={{ marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
        Crash Data Status
      </div>
      
      {/* Year Filter */}
      <div style={{ marginBottom: '8px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#ccc' }}>
          Filter by Year:
        </label>
        <select 
          value={selectedYear} 
          onChange={(e) => handleYearChange(e.target.value)}
          style={{
            backgroundColor: 'rgba(64, 64, 64, 0.8)',
            color: 'white',
            border: '1px solid rgba(128, 128, 128, 0.5)',
            borderRadius: '4px',
            padding: '4px 8px',
            fontSize: '12px',
            width: '100%',
            cursor: 'pointer'
          }}
        >
          {getAvailableYears().map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        Loaded: {data.length.toLocaleString()} crashes
        {yearFilter && ` (${yearFilter})`}
      </div>
      
      {pagination && (
        <div style={{ marginBottom: '6px', fontSize: '12px', color: '#ccc' }}>
          Page {pagination.page} of {pagination.totalPages}
          <br />
          Total: {pagination.total.toLocaleString()} crashes
        </div>
      )}
      
      {loading && (
        <div style={{ marginBottom: '8px', color: '#ffff99' }}>
          Loading...
        </div>
      )}
      
      {error && (
        <div style={{ marginBottom: '8px', color: '#ff6666', fontSize: '12px' }}>
          Error: {error}
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '8px' }}>
        {pagination?.hasNext && (
          <button
            onClick={loadMore}
            disabled={loading}
            style={{
              backgroundColor: loading ? 'rgba(102, 102, 102, 0.8)' : 'rgba(0, 122, 204, 0.9)',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.2s ease'
            }}
          >
            Load More
          </button>
        )}
        
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            backgroundColor: loading ? 'rgba(102, 102, 102, 0.8)' : 'rgba(40, 167, 69, 0.9)',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s ease'
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}