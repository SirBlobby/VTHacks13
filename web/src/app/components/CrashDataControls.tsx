"use client";

import React, { useState } from 'react';
import { UseCrashDataResult } from '../hooks/useCrashData';

interface CrashDataControlsProps {
  crashDataHook: UseCrashDataResult;
  onDataLoaded?: (dataCount: number) => void;
  mapStyleChoice?: 'dark' | 'streets';
}

export default function CrashDataControls({ crashDataHook, onDataLoaded, mapStyleChoice = 'dark' }: CrashDataControlsProps) {
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
      top: '12px',    // Position at top right instead of bottom
      right: '12px',  // Right side positioning
      backgroundColor: 'var(--panel-darker)', // Use new color palette
      color: '#f9fafb', // White text for both themes
      padding: '16px',
      borderRadius: '12px',
      zIndex: 1000,   // Much higher z-index to appear above everything
      fontSize: '14px',
      fontWeight: '500',
      width: '280px',
      backdropFilter: 'blur(20px)',
      border: '2px solid var(--panel-medium)',
      boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)'
    }}>
      {/* Crash Density Legend */}
      <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '10px', color: '#f9fafb' }}>Crash Density</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <div style={{ width: 20, height: 14, background: 'rgba(0,0,0,0)', border: '1px solid rgba(249, 250, 251, 0.4)', borderRadius: '2px' }} />
            <div style={{ width: 20, height: 14, background: 'rgba(255,255,0,0.8)', borderRadius: '2px' }} />
            <div style={{ width: 20, height: 14, background: 'rgba(255,165,0,0.85)', borderRadius: '2px' }} />
            <div style={{ width: 20, height: 14, background: 'rgba(255,69,0,0.9)', borderRadius: '2px' }} />
            <div style={{ width: 20, height: 14, background: 'rgba(255,0,0,0.95)', borderRadius: '2px' }} />
            <div style={{ width: 20, height: 14, background: 'rgba(139,0,0,1)', borderRadius: '2px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 12, color: '#ffffff', fontWeight: '600' }}>Low</span>
            <span style={{ fontSize: 12, color: '#ffffff', fontWeight: '600' }}>High</span>
          </div>
        </div>
        <div style={{ borderTop: mapStyleChoice === 'streets' ? '1px solid rgba(156, 163, 175, 0.5)' : '1px solid rgba(64, 64, 64, 0.5)', marginTop: '8px', paddingTop: '8px' }}></div>
      </div>
      
      <div style={{ marginBottom: '8px', fontWeight: 700, fontSize: '14px' }}>
        Crash Data Status
      </div>
      
      {/* Year Filter */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', color: '#e5e7eb', fontWeight: '600' }}>
          Filter by Year:
        </label>
        <select 
          value={yearFilter || ''} 
          onChange={(e) => handleYearChange(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: 'var(--panel-dark)',
            color: '#f9fafb',
            border: '2px solid var(--panel-medium)',
            fontSize: '14px',
            fontWeight: '500',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="">All Years</option>
          {Array.from({ length: 2025 - 2015 + 1 }, (_, i) => 2015 + i).map(year => (
            <option key={year} value={year} style={{ backgroundColor: 'var(--panel-dark)', color: '#f9fafb' }}>
              {year}
            </option>
          ))}
        </select>
      </div>
      
      <div style={{ marginBottom: '12px', color: '#f9fafb', fontWeight: '600', fontSize: '15px' }}>
        Loaded: {data.length.toLocaleString()} crashes
        {yearFilter && ` (${yearFilter})`}
      </div>
      
      {pagination && !yearFilter && (
        <div style={{ marginBottom: '8px', fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>
          Page {pagination.page} of {pagination.totalPages}
          <br />
          Total: {pagination.total.toLocaleString()} crashes
        </div>
      )}
      
      {pagination && yearFilter && (
        <div style={{ marginBottom: '8px', fontSize: '13px', color: '#9ca3af', fontWeight: '500' }}>
          All crashes for {yearFilter} loaded
        </div>
      )}
      
      {loading && (
        <div style={{ 
          marginBottom: '8px', 
          color: '#fbbf24',
          fontWeight: '600',
          fontSize: '14px'
        }}>
          Loading...
        </div>
      )}
      
      {error && (
        <div style={{ 
          marginBottom: '8px', 
          color: '#f87171', 
          fontSize: '13px',
          fontWeight: '600'
        }}>
          Error: {error}
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '8px' }}>
        {pagination?.hasNext && !yearFilter && (
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