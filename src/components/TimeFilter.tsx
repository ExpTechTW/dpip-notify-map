'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter, useSearchParams } from 'next/navigation';

export type TimeFilter = 'recent24h' | 'all' | 'timeSlot';

export interface TimeFilterProps {
  timeFilter: TimeFilter;
  startDate: string;
  endDate: string;
  onTimeFilterChange: (filter: TimeFilter) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onApplyTimeSlot: () => void;
  compact?: boolean;
}

export const TimeFilterComponent: React.FC<TimeFilterProps> = ({
  timeFilter,
  startDate,
  endDate,
  onTimeFilterChange,
  onStartDateChange,
  onEndDateChange,
  onApplyTimeSlot,
  compact = false
}) => {
  return (
    <div className={`space-y-2 ${compact ? 'text-xs' : ''}`}>
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        <Button
          variant={timeFilter === 'recent24h' ? 'default' : 'ghost'}
          size={compact ? 'sm' : 'default'}
          onClick={() => onTimeFilterChange('recent24h')}
          className={compact ? 'text-xs px-2 py-1 h-auto' : ''}
        >
          近 24 小時
        </Button>
        <Button
          variant={timeFilter === 'all' ? 'default' : 'ghost'}
          size={compact ? 'sm' : 'default'}
          onClick={() => onTimeFilterChange('all')}
          className={compact ? 'text-xs px-2 py-1 h-auto' : ''}
        >
          全部區間
        </Button>
        <Button
          variant={timeFilter === 'timeSlot' ? 'default' : 'ghost'}
          size={compact ? 'sm' : 'default'}
          onClick={() => onTimeFilterChange('timeSlot')}
          className={compact ? 'text-xs px-2 py-1 h-auto' : ''}
        >
          自定義
        </Button>
      </div>
      
      {timeFilter === 'timeSlot' && (
        <div className={`flex items-center gap-2 ${compact ? 'text-xs' : ''}`}>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className={`border rounded px-2 py-1 bg-background ${compact ? 'text-xs' : ''}`}
          />
          <span className={`text-muted-foreground ${compact ? 'text-xs' : ''}`}>至</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className={`border rounded px-2 py-1 bg-background ${compact ? 'text-xs' : ''}`}
          />
          <Button
            size={compact ? 'sm' : 'default'}
            variant="outline"
            onClick={onApplyTimeSlot}
            disabled={!startDate || !endDate}
            className={compact ? 'text-xs px-2 py-1 h-auto' : ''}
          >
            套用
          </Button>
        </div>
      )}
    </div>
  );
};

// Hook for time filtering logic
export const useTimeFilter = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all'); // 首頁默認全部區間
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // 從 URL 讀取參數
  useEffect(() => {
    const timeFilterParam = searchParams.get('timeFilter') as TimeFilter;
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    if (timeFilterParam && ['recent24h', 'all', 'timeSlot'].includes(timeFilterParam)) {
      setTimeFilter(timeFilterParam);
    }
    if (startDateParam) setStartDate(startDateParam);
    if (endDateParam) setEndDate(endDateParam);
  }, [searchParams]);

  // 更新 URL 參數
  const updateURL = (updates: { 
    timeFilter?: TimeFilter | null; 
    startDate?: string; 
    endDate?: string;
    preserveOthers?: boolean;
  }) => {
    const params = new URLSearchParams(window.location.search);
    
    if (updates.timeFilter === null) {
      params.delete('timeFilter');
      params.delete('startDate');
      params.delete('endDate');
    } else if (updates.timeFilter) {
      params.set('timeFilter', updates.timeFilter);
      if (updates.timeFilter !== 'timeSlot') {
        params.delete('startDate');
        params.delete('endDate');
      }
    }
    
    if (updates.startDate !== undefined) {
      if (updates.startDate) {
        params.set('startDate', updates.startDate);
      } else {
        params.delete('startDate');
      }
    }
    
    if (updates.endDate !== undefined) {
      if (updates.endDate) {
        params.set('endDate', updates.endDate);
      } else {
        params.delete('endDate');
      }
    }

    const newURL = `${window.location.pathname}?${params.toString()}`;
    router.replace(newURL);
  };

  const handleTimeFilterChange = (filter: TimeFilter) => {
    setTimeFilter(filter);
    updateURL({ timeFilter: filter });
  };

  const handleStartDateChange = (date: string) => {
    setStartDate(date);
  };

  const handleEndDateChange = (date: string) => {
    setEndDate(date);
  };

  const handleApplyTimeSlot = () => {
    if (startDate && endDate) {
      updateURL({ 
        timeFilter: 'timeSlot',
        startDate,
        endDate
      });
    }
  };

  // 篩選通知的函數
  const filterNotificationsByTime = <T extends { timestamp: number }>(notifications: T[]): T[] => {
    if (!notifications.length) return [];
    
    let filtered = notifications;
    
    if (timeFilter === 'recent24h') {
      const now = Date.now();
      const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
      filtered = filtered.filter(n => n.timestamp >= twentyFourHoursAgo);
    } else if (timeFilter === 'timeSlot' && startDate && endDate) {
      const startTime = new Date(startDate).getTime();
      const endTime = new Date(endDate + 'T23:59:59').getTime();
      filtered = filtered.filter(n => n.timestamp >= startTime && n.timestamp <= endTime);
    }
    
    return filtered;
  };

  return {
    timeFilter,
    startDate,
    endDate,
    handleTimeFilterChange,
    handleStartDateChange,
    handleEndDateChange,
    handleApplyTimeSlot,
    filterNotificationsByTime,
    updateURL
  };
};