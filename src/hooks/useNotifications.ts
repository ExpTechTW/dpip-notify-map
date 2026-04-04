'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { NotifyHistoryResponse, NotificationRecord } from '@/types/notify';

type LimitSetting = 'all' | number;

export function useNotifications(limit: LimitSetting = 'all') {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (fetchLimit: LimitSetting, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://api.core-tnn1.exptech.dev/api/v2/notify/history?limit=${fetchLimit}`,
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
  }, []);

  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchData(limit, controller.signal);
    return () => controller.abort();
  }, [limit, fetchData]);

  const refetch = useCallback(() => {
    abortRef.current?.abort();
    fetchData(limit);
  }, [limit, fetchData]);

  return { notifications, loading, error, refetch };
}
