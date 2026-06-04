'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { NotifyHistoryResponse, NotificationRecord } from '@/types/notify';
import { TimeFilter, computeTimeRange } from '@/components/TimeFilter';

export function useNotifications(
  timeFilter: TimeFilter = 'recent3h',
  startDate = '',
  endDate = '',
) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', 'all'); // 純時間查詢:回傳時間視窗內全部
      // 把時間範圍下推到後端(start/end 於此刻計算,以避免每次 render 變動)
      const { start, end } = computeTimeRange(timeFilter, startDate, endDate);
      if (start !== undefined) params.set('start', String(start));
      if (end !== undefined) params.set('end', String(end));

      const response = await fetch(
        `https://api.core-tnn1.exptech.dev/api/v2/notify/history?${params.toString()}`,
        signal ? { signal } : undefined
      );

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data: NotifyHistoryResponse = await response.json();
      if (!data.success) throw new Error('API returned success: false');

      const sorted = data.records.sort((a, b) => b.timestamp - a.timestamp);
      setNotifications(sorted);
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Failed to fetch notifications:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [timeFilter, startDate, endDate]);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const refetch = useCallback(() => {
    abortRef.current?.abort();
    fetchData();
  }, [fetchData]);

  return { notifications, loading, error, refetch };
}
