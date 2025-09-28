import { useState, useEffect, useCallback } from 'react';
import { CrashData, CrashResponse } from '../api/crashes/route';

export interface UseCrashDataOptions {
  autoLoad?: boolean;
  limit?: number;
  yearFilter?: string | null;
}

export interface UseCrashDataResult {
  data: CrashData[];
  loading: boolean;
  error: string | null;
  pagination: CrashResponse['pagination'] | null;
  yearFilter: string | null;
  loadPage: (page: number) => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  setYearFilter: (year: string | null) => void;
}

export function useCrashData(options: UseCrashDataOptions = {}): UseCrashDataResult {
  const currentYear = new Date().getFullYear().toString();
  const { autoLoad = true, limit = 100, yearFilter: initialYearFilter = currentYear } = options;
  
  const [data, setData] = useState<CrashData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<CrashResponse['pagination'] | null>(null);
  const [yearFilter, setYearFilterState] = useState<string | null>(initialYearFilter);

  const fetchCrashData = useCallback(async (page: number, append: boolean = false) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      
      if (yearFilter) {
        params.append('year', yearFilter);
      }

      const response = await fetch(`/api/crashes?${params.toString()}`);
      
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
  }, [limit, yearFilter]);

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

  const setYearFilter = useCallback((year: string | null) => {
    setYearFilterState(year);
    // Refresh data when year filter changes
    setData([]);
    setPagination(null);
  }, []);

  // Auto-load first page on mount or when year filter changes
  useEffect(() => {
    if (autoLoad) {
      loadPage(1);
    }
  }, [autoLoad, loadPage, yearFilter]);

  return {
    data,
    loading,
    error,
    pagination,
    yearFilter,
    loadPage,
    loadMore,
    refresh,
    setYearFilter,
  };
}