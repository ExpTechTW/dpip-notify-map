'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { DatePicker } from './DatePicker';

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

// 依目前起訖日算出日期輸入框可選範圍(超出者由原生選擇器灰掉):
// 不可選未來、不可選超過保留期(91 天前)、自訂跨度 ≤ 90 天。
export function getDateBounds(startDate: string, endDate: string) {
  const DAY = 86400000;
  const ymd = (ms: number) => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const parse = (s: string) => new Date(s + 'T00:00:00').getTime();
  const now = Date.now();
  const today = ymd(now);
  const floor = ymd(now - 91 * DAY); // 91 天前已被刪除,無資料
  return {
    startMin: endDate ? ymd(Math.max(now - 91 * DAY, parse(endDate) - 90 * DAY)) : floor,
    startMax: endDate || today,
    endMin: startDate || floor,
    endMax: startDate ? ymd(Math.min(now, parse(startDate) + 90 * DAY)) : today,
  };
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

      {timeFilter === 'timeSlot' && (() => {
        const b = getDateBounds(startDate, endDate);
        return (
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker value={startDate} min={b.startMin} max={b.startMax} onChange={onStartDateChange} className="w-32" />
          <span className="text-xs text-muted-foreground">—</span>
          <DatePicker value={endDate} min={b.endMin} max={b.endMax} onChange={onEndDateChange} className="w-32" />
          <button
            type="button"
            onClick={onApplyTimeSlot}
            disabled={!startDate || !endDate}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-45"
          >
            套用
          </button>
        </div>
        );
      })()}
    </div>
  );
};

interface TimeFilterContextValue {
  timeFilter: TimeFilter;
  startDate: string;          // 草稿(輸入框)
  endDate: string;
  appliedStartDate: string;   // 已套用(驅動查詢)
  appliedEndDate: string;
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
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('recent3h');
  const [startDate, setStartDate] = useState('');           // 草稿:輸入框值
  const [endDate, setEndDate] = useState('');
  const [appliedStartDate, setAppliedStartDate] = useState(''); // 已套用:驅動查詢
  const [appliedEndDate, setAppliedEndDate] = useState('');

  // mount 後從 URL 同步初始值(URL 內的日期視為「已套用」)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tf = params.get('timeFilter');
    if (tf && VALID_FILTERS.has(tf)) setTimeFilter(tf as TimeFilter);
    const sd = params.get('startDate');
    const ed = params.get('endDate');
    if (sd) { setStartDate(sd); setAppliedStartDate(sd); }
    if (ed) { setEndDate(ed); setAppliedEndDate(ed); }
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
    if (filter !== 'timeSlot') {
      // 切回 preset:清掉已套用的自訂範圍(preset 不需日期)
      setAppliedStartDate('');
      setAppliedEndDate('');
    }
    updateURL({ timeFilter: filter });
  }, [updateURL]);

  const handleApplyTimeSlot = useCallback(() => {
    if (!startDate || !endDate) return;
    // 自訂範圍上限 90 天(後端保留 91 天):超過則把起始日夾到「結束日 − 90 天」
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    let start = startDate;
    const span = new Date(endDate).getTime() - new Date(startDate).getTime();
    if (span > NINETY_DAYS_MS) {
      start = new Date(new Date(endDate).getTime() - NINETY_DAYS_MS).toISOString().slice(0, 10);
      setStartDate(start);
    }
    // 套用才提交範圍 → 觸發查詢(輸入草稿本身不觸發)
    setAppliedStartDate(start);
    setAppliedEndDate(endDate);
    updateURL({ timeFilter: 'timeSlot', startDate: start, endDate });
  }, [startDate, endDate, updateURL]);

  const filterNotificationsByTime = useCallback(
    <T extends { timestamp: number }>(notifications: T[]): T[] => {
      if (!notifications.length) return [];
      const { start, end } = computeTimeRange(timeFilter, appliedStartDate, appliedEndDate);
      if (start === undefined && end === undefined) return notifications;
      return notifications.filter(
        n => (start === undefined || n.timestamp >= start) && (end === undefined || n.timestamp <= end),
      );
    },
    [timeFilter, appliedStartDate, appliedEndDate]
  );

  const value: TimeFilterContextValue = {
    timeFilter, startDate, endDate,
    appliedStartDate, appliedEndDate,
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
