import { useState, useEffect } from 'react';

export interface RegionData {
  [city: string]: {
    [district: string]: {
      code: number;
      lat: number;
      lon: number;
      site: number;
      area: string;
    };
  };
}

export interface UseRegionDataReturn {
  regionData: RegionData | null;
  gridMatrix: Map<string, number> | null;
  loading: boolean;
  error: string | null;
}

// 全域快取
let regionDataCache: RegionData | null = null;
let gridMatrixCache: Map<string, number> | null = null;
let regionDataPromise: Promise<RegionData> | null = null;
let gridMatrixPromise: Promise<Map<string, number>> | null = null;

const loadRegionData = (): Promise<RegionData> => {
  if (regionDataCache) {
    return Promise.resolve(regionDataCache);
  }
  
  if (regionDataPromise) {
    return regionDataPromise;
  }
  
  regionDataPromise = fetch('https://raw.githubusercontent.com/ExpTechTW/dpip-notify-map/refs/heads/main/public/region.json')
    .then(res => {
      if (!res.ok) {
        throw new Error(`Failed to load region data: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      regionDataCache = data;
      return data;
    })
    .catch(err => {
      regionDataPromise = null; // 失敗時重置 promise
      throw err;
    });
  
  return regionDataPromise;
};

const loadGridMatrix = (): Promise<Map<string, number>> => {
  if (gridMatrixCache) {
    return Promise.resolve(gridMatrixCache);
  }
  
  if (gridMatrixPromise) {
    return gridMatrixPromise;
  }
  
  gridMatrixPromise = fetch('/grid-matrix.json')
    .then(res => {
      if (!res.ok) {
        throw new Error(`Failed to load grid matrix: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      const matrix = new Map<string, number>();
      Object.entries(data).forEach(([key, value]) => {
        matrix.set(key, value as number);
      });
      gridMatrixCache = matrix;
      return matrix;
    })
    .catch(err => {
      gridMatrixPromise = null; // 失敗時重置 promise
      throw err;
    });
  
  return gridMatrixPromise;
};

export const useRegionData = (): UseRegionDataReturn => {
  const [regionData, setRegionData] = useState<RegionData | null>(regionDataCache);
  const [gridMatrix, setGridMatrix] = useState<Map<string, number> | null>(gridMatrixCache);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      // 如果已經有快取資料，直接使用
      if (regionDataCache && gridMatrixCache) {
        setRegionData(regionDataCache);
        setGridMatrix(gridMatrixCache);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [regionResult, gridResult] = await Promise.all([
          loadRegionData(),
          loadGridMatrix()
        ]);

        setRegionData(regionResult);
        setGridMatrix(gridResult);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '載入資料失敗';
        console.error('載入地區資料失敗:', err);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  return {
    regionData,
    gridMatrix,
    loading,
    error
  };
};