'use client';

import { useMemo } from 'react';
import { NotificationRecord } from '@/types/notify';
import { useDataContext } from '@/contexts/DataContext';
import type { RegionData } from '@/hooks/useRegionData';
import { useTimeFilter } from '@/components/TimeFilter';
import { filterNotificationsByRegionName } from '@/utils/regionMatcher';

export interface FilteredNotificationsResult {
  notifications: NotificationRecord[];
  regionData: RegionData | null;
  gridMatrix: Map<string, number> | null;
  timeFilteredNotifications: NotificationRecord[];
  regionFilteredNotifications: NotificationRecord[];
  finalNotifications: NotificationRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFilteredNotifications(regionFilter?: string | null) {
  const { 
    notifications, 
    notificationsLoading, 
    notificationsError,
    regionData, 
    gridMatrix, 
    regionDataError,
    isDataReady,
    refetchNotifications
  } = useDataContext();
  const { filterNotificationsByTime } = useTimeFilter();

  const timeFilteredNotifications = useMemo(() => {
    return filterNotificationsByTime(notifications);
  }, [filterNotificationsByTime, notifications]);

  const regionFilteredNotifications = useMemo(() => {
    if (!regionFilter || !regionData || !gridMatrix) {
      return timeFilteredNotifications;
    }

    if (regionFilter === '全部(不指定地區的全部用戶廣播通知)') {
      return timeFilteredNotifications.filter(n => {
        if (n.codes.length === 0 && n.Polygons.length === 0) return true;
        if (n.codes.length > 0 && n.Polygons.length === 0) {
          return !n.codes.some(code => /\d+/.test(String(code)));
        }
        return false;
      });
    }

    if (regionFilter === '其他地區') {
      return timeFilteredNotifications.filter(notification => {
        if (!regionData || notification.codes.length === 0) return false;
        const hasRegionCode = notification.codes.some(code => /\d+/.test(String(code)));
        if (!hasRegionCode) return false;
        const hasMatch = notification.codes.some(code => {
          return Object.values(regionData).some(districts => 
            Object.values(districts).some(data => data.code === code)
          );
        }) || Object.keys(regionData).some(city => notification.title.includes(city));
        
        return !hasMatch;
      });
    }

    if (regionFilter === '未知區域廣播') {
      return timeFilteredNotifications.filter(notification => {
        return notification.Polygons.length > 0 && 
               (!regionData || !Object.keys(regionData).some(city => notification.title.includes(city)));
      });
    }

    return filterNotificationsByRegionName(timeFilteredNotifications, regionFilter, regionData, gridMatrix);
  }, [timeFilteredNotifications, regionFilter, regionData, gridMatrix]);

  const finalNotifications = regionFilter ? regionFilteredNotifications : timeFilteredNotifications;

  return {
    notifications,
    regionData,
    gridMatrix,
    timeFilteredNotifications,
    regionFilteredNotifications,
    finalNotifications,
    loading: notificationsLoading || !isDataReady,
    error: notificationsError || regionDataError,
    refetch: refetchNotifications
  };
}