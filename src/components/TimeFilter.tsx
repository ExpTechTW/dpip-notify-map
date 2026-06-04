'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

export const TIME_FILTER_OPTIONS: { value: TimeFilter; label: string }[] = [
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

const VALID_FILTERS = new Set<string>(TIME_FILTER_OPTIONS.map(o => o.value));

/** 由時間篩選狀態算出 { start, end }(ms);供前端篩選與後端查詢共用 */
export function computeTimeRange(
  timeFilter: TimeFilter,
  startDate: string,
  endDate: string,
): { start?: number; end?: number } {
  const duration = DURATION_MAP[timeFilter];
  if (duration) return { start: Date.now() - duration };
  if (timeFilter === 'timeSlot' && startDate && endDate) {
    return {
      start: new Date(startDate).getTime(),
      end: new Date(endDate + 'T23:59:59').getTime(),
    };
  }
  return {};
}

export const TimeFilterComponent: React.FC<TimeFilterProps> = ({
  timeFilter, startDate, endDate,
  onTimeFilterChange, onStartDateChange, onEndDateChange, onApplyTimeSlot,
}) => {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-xl border border-border/50 bg-muted/35 p-1">
        {TIME_FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onTimeFilterChange(opt.value)}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
              timeFilter === opt.value
                ? 'bg-background text-foreground shadow-sm ring-1 ring-black/[0.04] dark:ring-white/10'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {timeFilter === 'timeSlot' && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="rounded-lg border border-border/60 bg-background/90 px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="rounded-lg border border-border/60 bg-background/90 px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="button"
            onClick={onApplyTimeSlot}
            disabled={!startDate || !endDate}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-45"
          >
            套用
          </button>
        </div>
      )}
    </div>
  );
};

interface TimeFilterContextValue {
  timeFilter: TimeFilter;
  startDate: string;
  endDate: string;
  handleTimeFilterChange: (filter: TimeFilter) => void;
  handleStartDateChange: (date: string) => void;
  handleEndDateChange: (date: string) => void;
  handleApplyTimeSlot: () => void;
  filterNotificationsByTime: <T extends { timestamp: number }>(notifications: T[]) => T[];
  updateURL: (updates: { timeFilter?: TimeFilter | null; startDate?: string; endDate?: string }) => void;
}

const TimeFilterContext = createContext<TimeFilterContextValue | undefined>(undefined);

/**
 * 時間篩選的單一狀態來源(掛在 DataProvider 之上),
 * 讓 page / analytics / useFilteredNotifications 共用同一份狀態,
 * 並讓 DataContext 能據此把時間範圍下推到後端查詢。
 */
export function TimeFilterProvider({ children }: { children: React.ReactNode }) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // mount 後從 URL 同步初始值(與 LimitProvider 一致,避免 useSearchParams 的 Suspense 需求)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tf = params.get('timeFilter');
    if (tf && VALID_FILTERS.has(tf)) setTimeFilter(tf as TimeFilter);
    const sd = params.get('startDate');
    const ed = params.get('endDate');
    if (sd) setStartDate(sd);
    if (ed) setEndDate(ed);
  }, []);

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
      if (updates.startDate) params.set('startDate', updates.startDate);
      else params.delete('startDate');
    }
    if (updates.endDate !== undefined) {
      if (updates.endDate) params.set('endDate', updates.endDate);
      else params.delete('endDate');
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
      const { start, end } = computeTimeRange(timeFilter, startDate, endDate);
      if (start === undefined && end === undefined) return notifications;
      return notifications.filter(
        n => (start === undefined || n.timestamp >= start) && (end === undefined || n.timestamp <= end),
      );
    },
    [timeFilter, startDate, endDate]
  );

  const value: TimeFilterContextValue = {
    timeFilter, startDate, endDate,
    handleTimeFilterChange,
    handleStartDateChange: setStartDate,
    handleEndDateChange: setEndDate,
    handleApplyTimeSlot,
    filterNotificationsByTime,
    updateURL,
  };

  return <TimeFilterContext.Provider value={value}>{children}</TimeFilterContext.Provider>;
}

export const useTimeFilter = (): TimeFilterContextValue => {
  const ctx = useContext(TimeFilterContext);
  if (!ctx) throw new Error('useTimeFilter must be used within a TimeFilterProvider');
  return ctx;
};
