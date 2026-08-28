'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { useRegionData } from '@/hooks/useRegionData';
import { useTimeFilter } from '@/components/TimeFilter';
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
  // 已完成預計算的那一份 notifications(用陣列身分判斷,換資料就自動失效)
  const [precomputedFor, setPrecomputedFor] = useState<NotificationRecord[] | null>(null);

  const { timeFilter, appliedStartDate, appliedEndDate } = useTimeFilter();

  const {
    notifications,
    loading: notificationsLoading,
    error: notificationsError,
    refetch: refetchNotifications
  } = useNotifications(timeFilter, appliedStartDate, appliedEndDate);

  const {
    regionData,
    gridMatrix,
    loading: regionDataLoading,
    error: regionDataError
  } = useRegionData();

  useEffect(() => {
    if (!regionData || !gridMatrix || notifications.length === 0) return;
    precomputeAllRegionMatches(notifications, regionData, gridMatrix);
    setPrecomputedFor(notifications);
  }, [notifications, regionData, gridMatrix]);

  const isDataReady =
    !notificationsLoading &&
    !regionDataLoading &&
    regionData !== null &&
    gridMatrix !== null &&
    // 0 筆通知也算「就緒」(顯示空狀態,不需區域預計算);有資料才等預計算完成
    (notifications.length === 0 || precomputedFor === notifications);

  const value: DataContextType = {
    notifications,
    notificationsLoading,
    notificationsError,
    regionData,
    gridMatrix,
    regionDataLoading,
    regionDataError,
    isDataReady,
    refetchNotifications
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}
