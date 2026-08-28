'use client';

import { useMemo } from 'react';
import { NotificationRecord } from '@/types/notify';
import { useDataContext } from '@/contexts/DataContext';
import type { RegionData } from '@/hooks/useRegionData';
import { useTimeFilter } from '@/components/TimeFilter';
import {
  NATIONWIDE_REGION,
  filterNotificationsByRegionName,
  isKnownRegionCode,
} from '@/utils/regionMatcher';

export interface FilteredNotificationsResult {
  regionData: RegionData | null;
  gridMatrix: Map<string, number> | null;
  timeFilteredNotifications: NotificationRecord[];
  finalNotifications: NotificationRecord[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFilteredNotifications(regionFilter?: string | null): FilteredNotificationsResult {
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

  const finalNotifications = useMemo(() => {
    if (!regionFilter || !regionData || !gridMatrix) {
      return timeFilteredNotifications;
    }

    const cityNames = Object.keys(regionData);
    const titleHasCity = (n: NotificationRecord) => cityNames.some(city => n.title.includes(city));
    // codes 除了地區代碼外也可能是廣播主題(如 "report-all"、"eq-all"),以「含不含數字」區分
    const hasRegionCode = (n: NotificationRecord) => n.codes.some(code => /\d/.test(String(code)));

    // 全國廣播:沒有多邊形,且沒有任何地區代碼(完全未指定或只有廣播主題)
    if (regionFilter === NATIONWIDE_REGION) {
      return timeFilteredNotifications.filter(n => n.Polygons.length === 0 && !hasRegionCode(n));
    }

    // 其他地區:有地區代碼,但代碼與標題都對不上任何已知縣市
    if (regionFilter === '其他地區') {
      return timeFilteredNotifications.filter(n =>
        hasRegionCode(n) &&
        !n.codes.some(code => isKnownRegionCode(regionData, code)) &&
        !titleHasCity(n));
    }

    // 未知區域廣播:有多邊形,但標題認不出縣市
    if (regionFilter === '未知區域廣播') {
      return timeFilteredNotifications.filter(n => n.Polygons.length > 0 && !titleHasCity(n));
    }

    return filterNotificationsByRegionName(timeFilteredNotifications, regionFilter, regionData, gridMatrix);
  }, [timeFilteredNotifications, regionFilter, regionData, gridMatrix]);

  return {
    regionData,
    gridMatrix,
    timeFilteredNotifications,
    finalNotifications,
    loading: notificationsLoading || !isDataReady,
    error: notificationsError || regionDataError,
    refetch: refetchNotifications
  };
}
