'use client';

import { useMemo } from 'react';
import { NotificationRecord } from '@/types/notify';
import { useNotifications } from '@/hooks/useNotifications';
import { useRegionData } from '@/hooks/useRegionData';
import { useTimeFilter } from '@/components/TimeFilter';
import { filterNotificationsByRegionName } from '@/utils/regionMatcher';
import { useLimitContext } from '@/contexts/LimitContext';

export interface FilteredNotificationsResult {
  notifications: NotificationRecord[];
  timeFilteredNotifications: NotificationRecord[];
  regionFilteredNotifications: NotificationRecord[];
  finalNotifications: NotificationRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFilteredNotifications(regionFilter?: string | null) {
  const { limitSetting } = useLimitContext();
  const { notifications, loading, error, refetch } = useNotifications(limitSetting);
  const { regionData, gridMatrix, error: regionError } = useRegionData();
  const { filterNotificationsByTime } = useTimeFilter();

  // 1. 時間篩選
  const timeFilteredNotifications = useMemo(() => {
    return filterNotificationsByTime(notifications);
  }, [filterNotificationsByTime, notifications]);

  // 2. 地區篩選
  const regionFilteredNotifications = useMemo(() => {
    if (!regionFilter || !regionData || !gridMatrix) {
      return timeFilteredNotifications;
    }

    // 處理特殊的篩選條件
    if (regionFilter === '全部(不指定地區的全部用戶廣播通知)') {
      // 全國廣播：無codes和polygons，或codes不包含數字（非{topic}-{region code}格式）
      return timeFilteredNotifications.filter(n => {
        if (n.codes.length === 0 && n.Polygons.length === 0) return true;
        if (n.codes.length > 0 && n.Polygons.length === 0) {
          return !n.codes.some(code => /\d+/.test(String(code)));
        }
        return false;
      });
    }
    
    // 處理"其他地區"篩選條件 - 有地區代碼但無法匹配的通知
    if (regionFilter === '其他地區') {
      return timeFilteredNotifications.filter(notification => {
        if (!regionData || notification.codes.length === 0) return false;
        
        // 檢查是否有數字格式的地區代碼但無法匹配
        const hasRegionCode = notification.codes.some(code => /\d+/.test(String(code)));
        if (!hasRegionCode) return false;
        
        // 檢查是否匹配任何已知地區
        const hasMatch = notification.codes.some(code => {
          return Object.values(regionData).some(districts => 
            Object.values(districts).some(data => data.code === code)
          );
        }) || Object.keys(regionData).some(city => notification.title.includes(city));
        
        return !hasMatch;
      });
    }
    
    // 處理"未知區域廣播"篩選條件 - 有多邊形但無已知地區匹配
    if (regionFilter === '未知區域廣播') {
      return timeFilteredNotifications.filter(notification => {
        return notification.Polygons.length > 0 && 
               (!regionData || !Object.keys(regionData).some(city => notification.title.includes(city)));
      });
    }
    
    // 一般地區篩選
    return filterNotificationsByRegionName(timeFilteredNotifications, regionFilter, regionData, gridMatrix);
  }, [timeFilteredNotifications, regionFilter, regionData, gridMatrix]);

  // 最終結果
  const finalNotifications = regionFilter ? regionFilteredNotifications : timeFilteredNotifications;

  return {
    notifications,
    timeFilteredNotifications,
    regionFilteredNotifications,
    finalNotifications,
    loading,
    error: error || regionError,
    refetch
  };
}