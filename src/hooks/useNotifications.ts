'use client';

import { useState, useEffect } from 'react';
import { NotifyHistoryResponse, NotificationRecord } from '@/types/notify';

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('https://api.exptech.dev/api/v2/notify/history');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: NotifyHistoryResponse = await response.json();
        
        if (!data.success) {
          throw new Error('API returned success: false');
        }
        
        // 按時間排序，最新的在前面
        const sortedRecords = data.records.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        
        setNotifications(sortedRecords);
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);

  const refetch = () => {
    const fetchNotifications = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('https://api.exptech.dev/api/v2/notify/history');
        const data: NotifyHistoryResponse = await response.json();
        
        if (data.success) {
          const sortedRecords = data.records.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setNotifications(sortedRecords);
        }
      } catch (err) {
        console.error('Failed to refresh notifications:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  };

  return {
    notifications,
    loading,
    error,
    refetch,
  };
}