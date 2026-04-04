'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { useRegionData } from '@/hooks/useRegionData';
import { useLimitContext } from '@/contexts/LimitContext';
import { precomputeAllRegionMatches } from '@/utils/regionMatcher';
import type { NotificationRecord } from '@/types/notify';
import type { RegionData } from '@/hooks/useRegionData';

interface DataContextType {
  notifications: NotificationRecord[];
  notificationsLoading: boolean;
  notificationsError: string | null;
  regionData: RegionData | null;
  gridMatrix: Map<string, number> | null;
  regionDataLoading: boolean;
  regionDataError: string | null;
  precomputeCompleted: boolean;
  precomputeLoading: boolean;
  isDataReady: boolean;
  refetchNotifications: () => void;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function useDataContext() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [precomputeCompleted, setPrecomputeCompleted] = useState(false);
  const [precomputeLoading, setPrecomputeLoading] = useState(false);

  const { limitSetting } = useLimitContext();

  const {
    notifications,
    loading: notificationsLoading,
    error: notificationsError,
    refetch: refetchNotifications
  } = useNotifications(limitSetting);
  
  const {
    regionData,
    gridMatrix,
    loading: regionDataLoading,
    error: regionDataError
  } = useRegionData();

  useEffect(() => {
    if (
      notifications.length > 0 &&
      regionData &&
      gridMatrix &&
      !precomputeCompleted &&
      !precomputeLoading
    ) {
      setPrecomputeLoading(true);
      precomputeAllRegionMatches(notifications, regionData, gridMatrix)
        .then(() => {
          setPrecomputeCompleted(true);
          setPrecomputeLoading(false);
        })
        .catch((error) => {
          console.error('預計算失敗:', error);
          setPrecomputeLoading(false);
        });
    }
  }, [notifications, regionData, gridMatrix, precomputeCompleted, precomputeLoading]);

  useEffect(() => {
    setPrecomputeCompleted(false);
  }, [notifications]);

  const isDataReady =
    !notificationsLoading &&
    !regionDataLoading &&
    !precomputeLoading &&
    precomputeCompleted &&
    notifications.length > 0 &&
    regionData !== null &&
    gridMatrix !== null;
  
  const value: DataContextType = {
    notifications,
    notificationsLoading,
    notificationsError,
    regionData,
    gridMatrix,
    regionDataLoading,
    regionDataError,
    precomputeCompleted,
    precomputeLoading,
    isDataReady,
    refetchNotifications
  };
  
  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}