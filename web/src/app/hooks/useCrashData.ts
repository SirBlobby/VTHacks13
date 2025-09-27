import { useState, useEffect, useCallback } from 'react';
import { CrashData, CrashResponse } from '../api/crashes/route';

export interface UseCrashDataOptions {
  autoLoad?: boolean;
  limit?: number;
}

export interface UseCrashDataResult {
  data: CrashData[];
  loading: boolean;
  error: string | null;
  pagination: CrashResponse['pagination'] | null;
  loadPage: (page: number) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCrashData(options: UseCrashDataOptions = {}): UseCrashDataResult {
  const { autoLoad = true, limit = 100 } = options;
  
  const [data, setData] = useState<CrashData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<CrashResponse['pagination'] | null>(null);

  const fetchCrashData = useCallback(async (page: number, append: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/crashes?page=${page}&limit=${limit}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch crash data: ${response.statusText}`);
      }

      const result: CrashResponse = await response.json();
      
      if (append) {
        setData(prevData => [...prevData, ...result.data]);
      } else {
        setData(result.data);
      }
      
      setPagination(result.pagination);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch crash data';
      setError(errorMessage);
      console.error('Error fetching crash data:', err);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const loadPage = useCallback((page: number) => {
    return fetchCrashData(page, false);
  }, [fetchCrashData]);

  const loadMore = useCallback(() => {
    if (!pagination || !pagination.hasNext || loading) {
      return Promise.resolve();
    }
    return fetchCrashData(pagination.page + 1, true);
  }, [pagination, loading, fetchCrashData]);

  const refresh = useCallback(() => {
    return fetchCrashData(1, false);
  }, [fetchCrashData]);

  // Auto-load first page on mount
  useEffect(() => {
    if (autoLoad) {
      loadPage(1);
    }
  }, [autoLoad, loadPage]);

  return {
    data,
    loading,
    error,
    pagination,
    loadPage,
    loadMore,
    refresh,
  };
}