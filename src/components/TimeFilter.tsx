'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

export type TimeFilter = 'recent1h' | 'recent3h' | 'recent6h' | 'recent12h' | 'recent24h' | 'all' | 'timeSlot';

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

const TIME_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: 'recent1h', label: '1h' },
  { value: 'recent3h', label: '3h' },
  { value: 'recent6h', label: '6h' },
  { value: 'recent12h', label: '12h' },
  { value: 'recent24h', label: '24h' },
  { value: 'all', label: '全部' },
  { value: 'timeSlot', label: '自定義' },
];

const DURATION_MAP: Record<string, number> = {
  recent1h: 1 * 60 * 60 * 1000,
  recent3h: 3 * 60 * 60 * 1000,
  recent6h: 6 * 60 * 60 * 1000,
  recent12h: 12 * 60 * 60 * 1000,
  recent24h: 24 * 60 * 60 * 1000,
};

const VALID_FILTERS = new Set<string>(TIME_OPTIONS.map(o => o.value));

export const TimeFilterComponent: React.FC<TimeFilterProps> = ({
  timeFilter, startDate, endDate,
  onTimeFilterChange, onStartDateChange, onEndDateChange, onApplyTimeSlot,
}) => {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/50">
        {TIME_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onTimeFilterChange(opt.value)}
            className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${
              timeFilter === opt.value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {timeFilter === 'timeSlot' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date" value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 bg-background"
          />
          <span className="text-xs text-muted-foreground">-</span>
          <input
            type="date" value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 bg-background"
          />
          <button
            onClick={onApplyTimeSlot}
            disabled={!startDate || !endDate}
            className="px-2 py-1 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none"
          >
            套用
          </button>
        </div>
      )}
    </div>
  );
};

export const useTimeFilter = () => {
  const searchParams = useSearchParams();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const tf = searchParams.get('timeFilter');
    if (tf && VALID_FILTERS.has(tf)) setTimeFilter(tf as TimeFilter);
    const sd = searchParams.get('startDate');
    const ed = searchParams.get('endDate');
    if (sd) setStartDate(sd);
    if (ed) setEndDate(ed);
  }, [searchParams]);

  const updateURL = useCallback((updates: {
    timeFilter?: TimeFilter | null;
    startDate?: string;
    endDate?: string;
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
      updates.startDate ? params.set('startDate', updates.startDate) : params.delete('startDate');
    }
    if (updates.endDate !== undefined) {
      updates.endDate ? params.set('endDate', updates.endDate) : params.delete('endDate');
    }

    window.history.replaceState(null, '', `?${params.toString()}`);
  }, []);

  const handleTimeFilterChange = useCallback((filter: TimeFilter) => {
    setTimeFilter(filter);
    updateURL({ timeFilter: filter });
  }, [updateURL]);

  const handleApplyTimeSlot = useCallback(() => {
    if (startDate && endDate) {
      updateURL({ timeFilter: 'timeSlot', startDate, endDate });
    }
  }, [startDate, endDate, updateURL]);

  const filterNotificationsByTime = useCallback(
    <T extends { timestamp: number }>(notifications: T[]): T[] => {
      if (!notifications.length) return [];

      const duration = DURATION_MAP[timeFilter];
      if (duration) {
        const cutoff = Date.now() - duration;
        return notifications.filter(n => n.timestamp >= cutoff);
      }

      if (timeFilter === 'timeSlot' && startDate && endDate) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate + 'T23:59:59').getTime();
        return notifications.filter(n => n.timestamp >= start && n.timestamp <= end);
      }

      return notifications;
    },
    [timeFilter, startDate, endDate]
  );

  return {
    timeFilter, startDate, endDate,
    handleTimeFilterChange,
    handleStartDateChange: setStartDate,
    handleEndDateChange: setEndDate,
    handleApplyTimeSlot,
    filterNotificationsByTime,
    updateURL
  };
};
