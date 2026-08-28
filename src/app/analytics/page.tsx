'use client';

import { useState, useMemo, Suspense, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ArrowLeft, Filter, X, ChevronRight, AlertTriangle, Bell, MapPin, Percent, Send, BarChart3 } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { TimeFilterComponent, useTimeFilter, computeTimeRange, type TimeFilter } from '@/components/TimeFilter';
import { useFilteredNotifications } from '@/hooks/useFilteredNotifications';
import { NATIONWIDE_REGION, bucketNotificationsByRegions, getRegionCodes } from '@/utils/regionMatcher';
import { AppleIcon, AndroidIcon } from '@/components/icons/PlatformIcons';
import type { NotificationRecord } from '@/types/notify';

type ViewMode = 'city' | 'district';

type TypeCounts = Record<string, number>;

interface RegionStat {
  code: number;
  name: string;
  count: number;
  types: TypeCounts;
  criticalCount: number;
  districts?: string[];
}

interface AnalyticsData {
  regionStats: RegionStat[];
  totalNotifications: number;
  criticalNotifications: number;
  typeDistribution: TypeCounts;
}

// 動態統計通知類型:標題本身即為類型,只需歸併「標題帶有變動資訊」的兩種通知
function extractNotificationType(title: string): string {
  // 天氣特報(觀測值) 標題帶有區域(例:📊 臺南市白河區 天氣特報(觀測值)),移除區域統一歸類
  if (title.includes('天氣特報')) return '📊 ' + title.slice(title.indexOf('天氣特報'));
  // 地震報告(非小區域有感)標題帶有編號,統一歸類避免每筆各自成類
  if (title.includes('🔔 地震報告 ') && !title.includes('小區域有感地震')) return '🔔 地震報告 [編號]';
  // 其他通知標題皆無區域/編號等變動資訊,直接以標題作為類型
  return title;
}

/** 一批通知的筆數 / 類型分布 / 緊急數 */
function summarize(notifications: NotificationRecord[]) {
  const types: TypeCounts = {};
  let criticalCount = 0;
  for (const n of notifications) {
    const type = extractNotificationType(n.title);
    types[type] = (types[type] ?? 0) + 1;
    if (n.critical) criticalCount++;
  }
  return { count: notifications.length, types, criticalCount };
}

// 動態統計類型眾多,只顯示前 9 名,其餘合併為「其他」
const TOP_TYPES = 9;
function topTypes(types: TypeCounts): [string, number][] {
  const sorted = Object.entries(types).filter(([, count]) => count > 0).sort(([, a], [, b]) => b - a);
  if (sorted.length <= TOP_TYPES + 1) return sorted;
  const rest = sorted.slice(TOP_TYPES).reduce((sum, [, count]) => sum + count, 0);
  return [...sorted.slice(0, TOP_TYPES), ['其他', rest]];
}

const byCountDesc = (a: RegionStat, b: RegionStat) => b.count - a.count;

const ACCENT: Record<string, string> = {
  default: 'bg-primary/10 text-primary',
  red: 'bg-red-500/10 text-red-500',
  blue: 'bg-blue-500/10 text-blue-500',
  green: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-500',
};

function StatTile({ label, value, sub, icon, accent = 'default' }: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: keyof typeof ACCENT;
}) {
  return (
    <Card className="border-border/50 shadow-sm transition hover:shadow-md">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
        {icon && (
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${ACCENT[accent]}`}>{icon}</span>
        )}
      </CardContent>
    </Card>
  );
}

function PressureTile({ label, icon, pressure }: { label: ReactNode; icon: ReactNode; pressure: number | null }) {
  const pct = pressure === null ? null : pressure * 100;
  const over = pct !== null && pct > 100;
  const barWidth = pct === null ? 0 : Math.min(pct, 100);
  const barColor = pct === null ? 'bg-muted-foreground/30' : over ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <Card className="border-border/50 shadow-sm transition hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icon}{label}</span>
          {over && <Badge variant="destructive" className="h-4 px-1.5 text-[10px] font-semibold">超載</Badge>}
        </div>
        <div className={`mt-1.5 text-2xl font-bold tabular-nums ${over ? 'text-red-500' : ''}`}>
          {pct === null ? '—' : `${pct.toFixed(pct < 0.1 ? 2 : pct < 100 ? 1 : 0)}%`}
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${barWidth}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}

/** 類型分布的長條清單(統計卡與展開的鄉鎮區明細共用) */
function TypeBars({ types, total, size = 'md' }: { types: TypeCounts; total: number; size?: 'sm' | 'md' }) {
  const sm = size === 'sm';
  return (
    <div className={sm ? 'space-y-2' : 'space-y-3'}>
      {topTypes(types).map(([type, count]) => {
        const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={type} className="space-y-1">
            <div className={`flex items-center justify-between gap-2 ${sm ? 'text-xs' : 'text-sm'}`}>
              <span className={sm ? 'truncate' : 'truncate font-medium'}>{type}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {sm ? `${count} · ${percentage}%` : <>{count.toLocaleString()} <span className="text-muted-foreground/60">· {percentage}%</span></>}
              </span>
            </div>
            <div className={`${sm ? 'h-1' : 'h-1.5'} w-full overflow-hidden rounded-full bg-muted`}>
              <div className={`h-full rounded-full ${sm ? 'bg-primary/60' : 'bg-primary/70 transition-all duration-500'}`} style={{ width: `${Math.max(percentage, 2)}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsContent() {
  // 使用統一的時間篩選 hook
  const {
    timeFilter,
    startDate,
    endDate,
    handleTimeFilterChange,
    handleStartDateChange,
    handleEndDateChange,
    handleApplyTimeSlot
  } = useTimeFilter();

  const [currentRegionFilter, setCurrentRegionFilter] = useState<string | null>(null);

  const {
    finalNotifications: filteredNotifications,
    timeFilteredNotifications,
    regionData,
    gridMatrix,
    loading,
    error,
  } = useFilteredNotifications(currentRegionFilter);
  const [viewMode, setViewMode] = useState<ViewMode>('city');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);

  const router = useRouter();

  // 首頁 URL,保留目前的時間篩選(可再帶上地區)
  const buildHomeUrl = useMemo(() => {
    const timeParams = timeParamsOf(timeFilter, startDate, endDate);
    return (region?: string) => {
      const params = new URLSearchParams(timeParams);
      if (region) params.set('region', encodeURIComponent(region));
      return params.toString() ? `/?${params}` : '/';
    };
  }, [timeFilter, startDate, endDate]);
  const homeUrl = buildHomeUrl();

  // 緩存基本統計數據
  const basicStats = useMemo(() => summarize(filteredNotifications), [filteredNotifications]);

  // 推播發送量與壓力(時間視窗內、全地區)
  // 理論速率上限:單機/單 IP,各取 95% 當理論。
  const deliveryStats = useMemo(() => {
    const APNS_RATE = 5;
    const FCM_RATE = 5;
    const THEORY_FACTOR = 0.95;
    // 不含速報類(走 SNS 廣播、無逐台送達統計):地震速報 / 緊急地震速報 / 震度速報 / 強震監視器
    const EXCLUDED = ['地震速報', '震度速報', '強震監視器'];
    let ios = 0;
    let android = 0;
    for (const n of timeFilteredNotifications) {
      if (EXCLUDED.some(k => n.title.includes(k))) continue;
      ios += n.devices?.ios ?? 0;
      android += n.devices?.android ?? 0;
    }

    // 視窗秒數:preset/timeSlot 用篩選範圍;「全部」用資料時間跨度
    const range = computeTimeRange(timeFilter, startDate, endDate);
    let windowSec = 0;
    if (range.start !== undefined) {
      windowSec = ((range.end ?? Date.now()) - range.start) / 1000;
    } else if (timeFilteredNotifications.length > 1) {
      let min = Infinity, max = -Infinity;
      for (const n of timeFilteredNotifications) {
        if (n.timestamp < min) min = n.timestamp;
        if (n.timestamp > max) max = n.timestamp;
      }
      windowSec = (max - min) / 1000;
    }

    const iosMax = APNS_RATE * THEORY_FACTOR * windowSec;
    const androidMax = FCM_RATE * THEORY_FACTOR * windowSec;
    return {
      ios,
      android,
      total: ios + android,
      iosPressure: iosMax > 0 ? ios / iosMax : null,
      androidPressure: androidMax > 0 ? android / androidMax : null,
    };
  }, [timeFilteredNotifications, timeFilter, startDate, endDate]);

  // 縣市統計:一次掃描把通知分到 22 縣市 + 全國廣播(逐縣市各過濾一遍會是 O(縣市 × 通知))
  const cityStats = useMemo((): RegionStat[] | null => {
    if (!regionData || !gridMatrix || currentRegionFilter) return null;

    const names = [...Object.keys(regionData), NATIONWIDE_REGION];
    const buckets = bucketNotificationsByRegions(timeFilteredNotifications, names, regionData, gridMatrix);
    return names.map(name => ({
      code: 0, // 縣市層級不顯示代碼(UI 改顯示鄉鎮區數量)
      name,
      ...summarize(buckets.get(name)!),
      districts: Object.keys(regionData[name] ?? {}),
    }));
  }, [regionData, gridMatrix, timeFilteredNotifications, currentRegionFilter]);

  // 篩選到某縣市時:同樣一次掃描算出該縣市下所有鄉鎮區的統計
  const districtStats = useMemo((): RegionStat[] | null => {
    if (!regionData || !gridMatrix || !currentRegionFilter) return null;
    const districts = regionData[currentRegionFilter];
    if (!districts) return null; // 篩選的是鄉鎮區層級,不需展開

    const entries = Object.entries(districts).map(([d, data]) => ({ name: `${currentRegionFilter}${d}`, code: data.code }));
    const buckets = bucketNotificationsByRegions(timeFilteredNotifications, entries.map(e => e.name), regionData, gridMatrix);
    return entries.map(({ name, code }) => ({ code, name, ...summarize(buckets.get(name)!) }));
  }, [regionData, gridMatrix, timeFilteredNotifications, currentRegionFilter]);

  const analyticsData = useMemo((): AnalyticsData => {
    if (!regionData || !gridMatrix) {
      return { regionStats: [], totalNotifications: 0, criticalNotifications: 0, typeDistribution: {} };
    }

    let regionStats: RegionStat[] = [];
    if (!currentRegionFilter) {
      if (viewMode === 'city' && cityStats) regionStats = [...cityStats].sort(byCountDesc);
    } else if (viewMode === 'district') {
      regionStats = districtStats
        ? [...districtStats].sort(byCountDesc)
        // 鄉鎮區層級篩選:只顯示該鄉鎮區自己的統計
        : [{
          code: getRegionCodes(regionData, currentRegionFilter).values().next().value ?? 0,
          name: currentRegionFilter,
          count: filteredNotifications.length,
          types: basicStats.types,
          criticalCount: basicStats.criticalCount,
        }];
    }

    return {
      regionStats,
      totalNotifications: filteredNotifications.length,
      criticalNotifications: basicStats.criticalCount,
      typeDistribution: basicStats.types
    };
  }, [regionData, gridMatrix, filteredNotifications, viewMode, currentRegionFilter, cityStats, districtStats, basicStats]);

  const isNationwideView = viewMode === 'district' && selectedCity === NATIONWIDE_REGION;
  const cityLabel = selectedCity === NATIONWIDE_REGION ? '全國廣播' : selectedCity;

  if (loading) {
    return (
      <LoadingSpinner
        fullScreen
        message="載入分析資料中..."
        description="正在處理通知統計"
      />
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/35 p-6">
        <div className="max-w-md rounded-2xl border border-destructive/20 bg-card/95 p-8 text-center shadow-lg">
          <p className="text-sm font-medium text-destructive">無法載入資料</p>
          <p className="mt-2 text-xs text-muted-foreground">{error}</p>
          <Link href={homeUrl}>
            <Button variant="outline" size="sm" className="mt-6 rounded-xl">
              返回首頁
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/35">
      <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href={homeUrl}>
            <Button variant="outline" size="sm" className="gap-2 rounded-xl border-border/60 shadow-sm">
              <ArrowLeft className="size-4" />
              返回首頁
            </Button>
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
              <BarChart3 className="size-6 text-primary sm:size-7" />
              通知統計分析
            </h1>
            {viewMode === 'district' && selectedCity && (
              <div className="flex items-center gap-2 mt-1">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">查看: {selectedCity}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCity(null);
                    setSelectedDistrict(null);
                    setCurrentRegionFilter(null);
                    setViewMode('city');
                  }}
                  className="h-6 w-6 p-0"
                  title="返回縣市列表"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-xl border border-border/50 bg-muted/35 p-1">
            <Button
              variant={viewMode === 'city' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-lg"
              onClick={() => {
                setViewMode('city');
                setSelectedCity(null);
                setSelectedDistrict(null);
                setCurrentRegionFilter(null);
              }}
            >
              縣市
            </Button>
            <Button
              variant={viewMode === 'district' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-lg"
              onClick={() => setViewMode('district')}
              disabled={!selectedCity}
            >
              {selectedCity === NATIONWIDE_REGION ? '全國廣播' : '鄉鎮區'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <TimeFilterComponent
              timeFilter={timeFilter}
              startDate={startDate}
              endDate={endDate}
              onTimeFilterChange={handleTimeFilterChange}
              onStartDateChange={handleStartDateChange}
              onEndDateChange={handleEndDateChange}
              onApplyTimeSlot={handleApplyTimeSlot}
              compact={true}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" key={`stats-${viewMode}-${selectedCity}`}>
        <StatTile
          label="總通知數量"
          value={analyticsData.totalNotifications.toLocaleString()}
          icon={<Bell className="size-4" />}
          sub={viewMode === 'district' && selectedCity ? cityLabel : undefined}
        />
        <StatTile
          label="緊急通知"
          value={analyticsData.criticalNotifications.toLocaleString()}
          icon={<AlertTriangle className="size-4" />}
          accent="red"
        />
        <StatTile
          label="影響鄉鎮"
          value={(viewMode === 'city'
            ? analyticsData.regionStats.reduce((total, region) => total + (region.districts?.length || 0), 0)
            : analyticsData.regionStats.length).toLocaleString()}
          icon={<MapPin className="size-4" />}
          accent="blue"
        />
        <StatTile
          label="緊急比例"
          value={`${analyticsData.totalNotifications > 0 ? Math.round((analyticsData.criticalNotifications / analyticsData.totalNotifications) * 100) : 0}%`}
          icon={<Percent className="size-4" />}
          accent="amber"
        />
      </div>

      {/* 推播發送量與壓力(時間視窗內、全地區) */}
      <div className="space-y-3">
        <h2 className="px-0.5 text-sm font-semibold">
          推播發送 <span className="font-normal text-muted-foreground/70">· 時間視窗內 · 全地區</span>
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="累積發送數量"
            value={deliveryStats.total.toLocaleString()}
            icon={<Send className="size-4" />}
            accent="green"
            sub={
              <>
                <span className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1"><AppleIcon className="size-2.5" />{deliveryStats.ios.toLocaleString()}</span>
                  <span className="inline-flex items-center gap-1"><AndroidIcon className="size-3" />{deliveryStats.android.toLocaleString()}</span>
                </span>
                <span className="mt-1 block text-[10px] leading-tight text-muted-foreground/60">
                  不含地震速報・緊急地震速報・震度速報・強震監視器
                </span>
              </>
            }
          />
          <PressureTile label="iOS 推播壓力" icon={<AppleIcon className="size-3" />} pressure={deliveryStats.iosPressure} />
          <PressureTile label="Android 推播壓力" icon={<AndroidIcon className="size-3.5" />} pressure={deliveryStats.androidPressure} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card key={`type-distribution-${viewMode}-${selectedCity}`}>
          <CardHeader>
            <CardTitle>通知類型分布</CardTitle>
            <CardDescription>
              {viewMode === 'city'
                ? '全部縣市的通知類型統計'
                : selectedCity
                  ? `${cityLabel} 的通知類型統計`
                  : '不同類型通知的數量統計'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TypeBars
              types={
                viewMode === 'city' || selectedCity === NATIONWIDE_REGION
                  ? analyticsData.typeDistribution
                  : analyticsData.regionStats.reduce<TypeCounts>((acc, region) => {
                    for (const [type, count] of Object.entries(region.types)) acc[type] = (acc[type] || 0) + count;
                    return acc;
                  }, {})
              }
              total={analyticsData.totalNotifications}
            />
          </CardContent>
        </Card>

        {!isNationwideView && (
          <Card>
            <CardHeader>
              <CardTitle>
                {viewMode === 'city' ? '縣市' : selectedCity ? `${selectedCity} 鄉鎮區` : '鄉鎮區'} 通知排行
              </CardTitle>
              <CardDescription>
                {viewMode === 'city'
                  ? '各縣市收到的通知數量排名（前10名）'
                  : '各鄉鎮區收到的通知數量排名（前10名）'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {analyticsData.regionStats.slice(0, 10).map((region, index) => {
                  const rank = index + 1;
                  const medal =
                    rank === 1 ? 'bg-amber-400/20 text-amber-600 dark:text-amber-400'
                      : rank === 2 ? 'bg-slate-400/20 text-slate-500 dark:text-slate-300'
                        : rank === 3 ? 'bg-orange-400/20 text-orange-600 dark:text-orange-400'
                          : 'bg-muted text-muted-foreground';
                  return (
                    <div key={`${region.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums ${medal}`}>{rank}</span>
                        <span className="truncate font-medium">{region.name}</span>
                        {region.criticalCount > 0 && (
                          <Badge variant="destructive" className="h-5 shrink-0 px-1.5 text-[10px]">
                            緊急 {region.criticalCount}
                          </Badge>
                        )}
                      </div>
                      <span className="shrink-0 font-bold tabular-nums">{region.count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {!isNationwideView && (
        <Card>
          <CardHeader>
            <CardTitle>
              {viewMode === 'city' ? '縣市' : selectedCity ? `${selectedCity} 鄉鎮區` : '鄉鎮區'} 詳細統計
            </CardTitle>
            <CardDescription>
              {viewMode === 'city'
                ? '各縣市及特殊分類的詳細通知統計（點擊縣市查看轄區詳情，點擊特殊分類篩選並查看地圖）'
                : '各鄉鎮區的詳細通知統計（點擊篩選並查看地圖）'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analyticsData.regionStats.map((region, index) => {
              const isSelected = viewMode === 'district' && selectedDistrict === region.name;

              return (
              <div key={`${region.name}-detail-${index}`}
                   className={`rounded-xl border p-4 cursor-pointer transition-all group ${
                     isSelected ? 'border-primary/50 bg-primary/[0.06] shadow-sm' : 'border-border/50 hover:border-border hover:bg-muted/30'
                   }`}
                   onClick={() => {
                     if (viewMode === 'city') {
                       // 縣市模式：切換到鄉鎮區模式，並應用地區篩選
                       setSelectedCity(region.name);
                       setSelectedDistrict(null);
                       setCurrentRegionFilter(region.name);
                       setViewMode('district');
                     } else if (selectedDistrict === region.name) {
                       // 鄉鎮區模式且已選中：跳轉到首頁
                       router.push(buildHomeUrl(region.name));
                     } else {
                       setSelectedDistrict(region.name);
                     }
                   }}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-semibold group-hover:text-primary transition-colors">{region.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {viewMode === 'city' && 'districts' in region
                        ? `包含 ${region.districts?.length || 0} 個鄉鎮區`
                        : `地區代碼: ${region.code}`
                      }
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">{region.count} 次通知</div>
                    {region.criticalCount > 0 && (
                      <Badge variant="destructive">緊急 {region.criticalCount}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {Object.entries(region.types)
                    .filter(([, count]) => count > 0)
                    .map(([type, count]) => (
                      <Badge key={type} variant="secondary">
                        {type}: {count}
                      </Badge>
                    ))}
                  {Object.keys(region.types).length === 0 && (
                    <span className="text-xs text-muted-foreground">無類型數據</span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {isSelected && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(buildHomeUrl(region.name));
                        }}
                      >
                        前往地圖
                      </Button>
                    )}
                    <div className={`transition-opacity ${
                      isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>

                {/* 選中時顯示詳細類型分布 */}
                {isSelected && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="text-center">
                        <div className="text-lg font-bold text-red-500">
                          {region.criticalCount}
                        </div>
                        <div className="text-xs text-muted-foreground">緊急通知</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold">
                          {region.count > 0 ? Math.round((region.criticalCount / region.count) * 100) : 0}%
                        </div>
                        <div className="text-xs text-muted-foreground">緊急比例</div>
                      </div>
                    </div>

                    <h4 className="font-medium mb-3">通知類型分布</h4>
                    <TypeBars types={region.types} total={region.count} size="sm" />
                  </div>
                )}
              </div>
              );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {isNationwideView && (
        <Card>
          <CardHeader>
            <CardTitle>前往首頁查看通知</CardTitle>
            <CardDescription>點擊下方按鈕前往首頁查看全國廣播通知的詳細內容</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push(buildHomeUrl(NATIONWIDE_REGION))} className="w-full">
              查看全國廣播通知
            </Button>
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  );
}

/** 時間篩選要帶到另一頁的 query 參數(「全部」不需帶) */
function timeParamsOf(timeFilter: TimeFilter, startDate: string, endDate: string): URLSearchParams {
  const params = new URLSearchParams();
  if (timeFilter === 'all') return params;
  params.set('timeFilter', timeFilter);
  if (timeFilter === 'timeSlot' && startDate && endDate) {
    params.set('startDate', startDate);
    params.set('endDate', endDate);
  }
  return params;
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={
      <LoadingSpinner
        fullScreen
        size="lg"
        message="載入中..."
        description="正在獲取分析資料"
      />
    }>
      <AnalyticsContent />
    </Suspense>
  );
}
