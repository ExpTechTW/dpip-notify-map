'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { useRegionData } from '@/hooks/useRegionData';
import { precomputeAllRegionMatches } from '@/utils/regionMatcher';
import type { NotificationRecord } from '@/types/notify';
import type { RegionData } from '@/hooks/useRegionData';

interface DataContextType {
  // 通知資料
  notifications: NotificationRecord[];
  notificationsLoading: boolean;
  notificationsError: string | null;
  
  // 地區資料
  regionData: RegionData | null;
  gridMatrix: Map<string, number> | null;
  regionDataLoading: boolean;
  regionDataError: string | null;
  
  // 預計算狀態
  precomputeCompleted: boolean;
  precomputeLoading: boolean;
  
  // 統合狀態
  isDataReady: boolean;
  
  // 重新載入功能
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
  
  // 使用現有的 hooks，預設載入全部通知
  const {
    notifications,
    loading: notificationsLoading,
    error: notificationsError,
    refetch: refetchNotifications
  } = useNotifications('all');
  
  const {
    regionData,
    gridMatrix,
    loading: regionDataLoading,
    error: regionDataError
  } = useRegionData();
  
  // 執行預計算
  useEffect(() => {
    if (notifications.length > 0 && regionData && gridMatrix && !precomputeCompleted && !precomputeLoading) {
      setPrecomputeLoading(true);
      
      // 使用 setTimeout 來避免阻塞 UI
      setTimeout(async () => {
        try {
          await precomputeAllRegionMatches(notifications, regionData, gridMatrix);
          setPrecomputeCompleted(true);
        } catch (error) {
          console.error('預計算失敗:', error);
        } finally {
          setPrecomputeLoading(false);
        }
      }, 0);
    }
  }, [notifications, regionData, gridMatrix, precomputeCompleted, precomputeLoading]);
  
  // 當通知資料重新載入時，重置預計算狀態
  useEffect(() => {
    setPrecomputeCompleted(false);
  }, [notifications]);
  
  const isDataReady = !notificationsLoading && 
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