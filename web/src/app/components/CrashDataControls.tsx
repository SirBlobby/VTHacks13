"use client";

import React from 'react';
import { UseCrashDataResult } from '../hooks/useCrashData';

interface CrashDataControlsProps {
  crashDataHook: UseCrashDataResult;
  onDataLoaded?: (dataCount: number) => void;
}

export default function CrashDataControls({ crashDataHook, onDataLoaded }: CrashDataControlsProps) {
  const { data, loading, error, pagination, loadMore, refresh } = crashDataHook;

  React.useEffect(() => {
    if (onDataLoaded) {
      onDataLoaded(data.length);
    }
  }, [data.length, onDataLoaded]);

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      right: '10px',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '12px',
      borderRadius: '6px',
      zIndex: 30,
      fontSize: '14px',
      minWidth: '200px'
    }}>
      <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
        Crash Data Status
      </div>
      
      <div style={{ marginBottom: '6px' }}>
        Loaded: {data.length.toLocaleString()} crashes
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
              backgroundColor: loading ? '#666' : '#007acc',
              color: 'white',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            Load More
          </button>
        )}
        
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            backgroundColor: loading ? '#666' : '#28a745',
            color: 'white',
            border: 'none',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}