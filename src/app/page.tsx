'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLimitSync } from '@/hooks/useLimitSync';
import NotificationList from '@/components/NotificationList';
import PhonePreview from '@/components/PhonePreview';
import MapView from '@/components/MapView';
import { NotificationRecord } from '@/types/notify';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RefreshCcw, AlertTriangle, BarChart3, Filter, X, ChevronDown } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ThemeToggle } from '@/components/theme-toggle';
import Link from 'next/link';
import { TimeFilterComponent, useTimeFilter, TimeFilter } from '@/components/TimeFilter';
import { useFilteredNotifications } from '@/hooks/useFilteredNotifications';
import Image from 'next/image';

const LIMIT_OPTIONS = [
  { value: 100 as const, label: '100' },
  { value: 500 as const, label: '500' },
  { value: 1000 as const, label: '1K' },
  { value: 'all' as const, label: '全部' },
];

function HomeContent() {
  const { limitSetting, updateLimit } = useLimitSync();
  const [selectedNotification, setSelectedNotification] = useState<NotificationRecord | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const {
    timeFilter, startDate, endDate,
    handleTimeFilterChange, handleStartDateChange, handleEndDateChange, handleApplyTimeSlot
  } = useTimeFilter();

  const {
    finalNotifications: notifications,
    regionData,
    timeFilteredNotifications,
    loading, error, refetch
  } = useFilteredNotifications(regionFilter);

  const searchParams = useSearchParams();
  const router = useRouter();

  const analyticsUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (timeFilter !== 'all') {
      params.set('timeFilter', timeFilter);
      if (timeFilter === 'timeSlot' && startDate && endDate) {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      }
    }
    if (limitSetting !== 100) params.set('limit', limitSetting.toString());
    return params.toString() ? `/analytics?${params.toString()}` : '/analytics';
  }, [timeFilter, startDate, endDate, limitSetting]);

  // 從 URL 同步地區篩選
  useEffect(() => {
    const regionParam = searchParams.get('region');
    if (regionParam) {
      const decoded = decodeURIComponent(regionParam);
      setRegionFilter(decoded);
      if (decoded === '全部(不指定地區的全部用戶廣播通知)') {
        setSelectedCity(decoded);
        setSelectedDistrict(null);
      } else if (regionData) {
        if (Object.keys(regionData).includes(decoded)) {
          setSelectedCity(decoded);
          setSelectedDistrict(null);
        } else {
          for (const [city, districts] of Object.entries(regionData)) {
            for (const district of Object.keys(districts)) {
              if (`${city}${district}` === decoded) {
                setSelectedCity(city);
                setSelectedDistrict(decoded);
                break;
              }
            }
          }
        }
      }
    } else {
      setRegionFilter(null);
      setSelectedCity(null);
      setSelectedDistrict(null);
    }
  }, [searchParams, regionData]);

  // 從 URL 同步選中的通知
  useEffect(() => {
    if (notifications.length === 0) { setSelectedNotification(null); return; }
    const t = searchParams.get('t');
    if (t) {
      const ts = parseInt(t, 10);
      setSelectedNotification(notifications.find(n => n.timestamp === ts) || notifications[0]);
    } else {
      setSelectedNotification(notifications[0]);
    }
  }, [notifications, searchParams]);

  const handleSelectNotification = (notification: NotificationRecord) => {
    setSelectedNotification(notification);
    const params = new URLSearchParams(searchParams);
    params.set('t', notification.timestamp.toString());
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const clearRegionFilter = () => {
    setSelectedCity(null);
    setSelectedDistrict(null);
    setRegionFilter(null);
    const params = new URLSearchParams(searchParams);
    params.delete('region');
    router.push(`/?${params.toString()}`, { scroll: false });
  };

  const hasRegionFilter = selectedCity || selectedDistrict || regionFilter;
  const recordCount = hasRegionFilter
    ? `${notifications.length} / ${timeFilteredNotifications.length}`
    : `${timeFilteredNotifications.length}`;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border/40 px-3 sm:px-5 py-2 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* 左：Logo + 資訊 */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Image
              src="https://raw.githubusercontent.com/ExpTechTW/DPIP-Pocket/refs/heads/main/assets/DPIP.png"
              alt="DPIP"
              className="rounded-lg cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
              width={32}
              height={32}
              onClick={() => window.open('https://github.com/ExpTechTW/DPIP-Pocket', '_blank')}
            />
            <div className="min-w-0">
              <h1 className="text-sm font-semibold leading-tight">DPIP 通知紀錄</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] text-muted-foreground tabular-nums">{recordCount} 筆</span>
                {hasRegionFilter && (
                  <button
                    onClick={clearRegionFilter}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-primary/10 text-[11px] text-primary font-medium hover:bg-primary/20 transition-colors"
                  >
                    <Filter className="w-2.5 h-2.5" />
                    <span className="truncate max-w-[100px]">{selectedDistrict || selectedCity || regionFilter}</span>
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 右：控制項 */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* 桌面版時間篩選 */}
            <div className="hidden lg:block">
              <TimeFilterComponent
                timeFilter={timeFilter} startDate={startDate} endDate={endDate}
                onTimeFilterChange={handleTimeFilterChange}
                onStartDateChange={handleStartDateChange}
                onEndDateChange={handleEndDateChange}
                onApplyTimeSlot={handleApplyTimeSlot}
              />
            </div>

            {/* 手機版時間篩選 */}
            <div className="lg:hidden relative">
              <select
                value={timeFilter}
                onChange={(e) => handleTimeFilterChange(e.target.value as TimeFilter)}
                className="appearance-none text-xs border border-border/50 rounded-lg pl-2 pr-6 py-1.5 bg-background hover:bg-accent transition-colors cursor-pointer"
              >
                <option value="recent12h">12h</option>
                <option value="recent24h">24h</option>
                <option value="all">全部</option>
                <option value="timeSlot">自定義</option>
              </select>
              <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>

            {/* 數量 */}
            <div className="hidden md:flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/50">
              {LIMIT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => updateLimit(opt.value)}
                  className={`px-2 py-1 text-xs font-medium rounded-md transition-all ${
                    limitSetting === opt.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* 地區 */}
            {regionData && (
              <div className="hidden md:flex gap-1">
                <div className="relative">
                  <select
                    value={selectedCity || ''}
                    onChange={(e) => {
                      const city = e.target.value;
                      setSelectedCity(city || null);
                      setSelectedDistrict(null);
                      setRegionFilter(city || null);
                      const params = new URLSearchParams(searchParams);
                      if (city) { params.set('region', encodeURIComponent(city)); } else { params.delete('region'); }
                      router.push(`/?${params.toString()}`, { scroll: false });
                    }}
                    className="appearance-none text-xs border border-border/50 rounded-lg pl-2 pr-6 py-1.5 bg-background hover:bg-accent transition-colors cursor-pointer"
                  >
                    <option value="">全部縣市</option>
                    <option value="全部(不指定地區的全部用戶廣播通知)">全國廣播</option>
                    {Object.keys(regionData).map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>

                {selectedCity && selectedCity !== '全部(不指定地區的全部用戶廣播通知)' && (
                  <div className="relative">
                    <select
                      value={selectedDistrict || ''}
                      onChange={(e) => {
                        const district = e.target.value;
                        setSelectedDistrict(district || null);
                        setRegionFilter(district || selectedCity);
                        const params = new URLSearchParams(searchParams);
                        const region = district || selectedCity;
                        if (region) { params.set('region', encodeURIComponent(region)); } else { params.delete('region'); }
                        router.push(`/?${params.toString()}`, { scroll: false });
                      }}
                      className="appearance-none text-xs border border-border/50 rounded-lg pl-2 pr-6 py-1.5 bg-background hover:bg-accent transition-colors cursor-pointer"
                    >
                      <option value="">全部鄉鎮區</option>
                      {Object.keys(regionData[selectedCity] || {}).map(d => (
                        <option key={d} value={`${selectedCity}${d}`}>{d}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  </div>
                )}
              </div>
            )}

            <div className="w-px h-5 bg-border/50 hidden sm:block" />

            <Link href={analyticsUrl}>
              <button className="h-8 px-2.5 flex items-center gap-1.5 text-xs font-medium rounded-lg border border-border/50 bg-background hover:bg-accent transition-colors">
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">分析</span>
              </button>
            </Link>
            <ThemeToggle />
            <button
              onClick={refetch}
              className="h-8 px-2.5 flex items-center gap-1.5 text-xs font-medium rounded-lg border border-border/50 bg-background hover:bg-accent transition-colors"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">重整</span>
            </button>
          </div>
        </div>
      </header>

      {/* 內容 */}
      <div className="flex-1 flex overflow-hidden min-h-0 p-2 sm:p-3 lg:p-4 gap-2 sm:gap-3 lg:gap-4 relative">
        {loading && (
          <LoadingSpinner
            overlay size="md"
            message="載入通知資料中..."
            description={`正在獲取${limitSetting === 'all' ? '全部' : ` ${limitSetting} 筆`}資料`}
          />
        )}

        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button onClick={refetch} size="sm" className="gap-2">
                <RefreshCcw className="w-3.5 h-3.5" />
                重試
              </Button>
            </div>
          </div>
        )}

        {/* 桌面版 xl+ */}
        <div className="hidden xl:flex flex-1 min-h-0 gap-3">
          <Card className="w-80 flex-shrink-0 overflow-hidden">
            <NotificationList notifications={notifications} selectedNotification={selectedNotification} onSelectNotification={handleSelectNotification} />
          </Card>
          <Card className="w-[450px] bg-gradient-to-b from-muted/20 to-muted/40 flex-shrink-0 overflow-hidden">
            <PhonePreview notification={selectedNotification} />
          </Card>
          <Card className="flex-1 min-w-0 overflow-hidden">
            <MapView notification={selectedNotification} />
          </Card>
        </div>

        {/* 大平板 lg */}
        <div className="hidden lg:flex xl:hidden flex-1 min-h-0 gap-3">
          <Card className="w-72 flex-shrink-0 overflow-hidden">
            <NotificationList notifications={notifications} selectedNotification={selectedNotification} onSelectNotification={handleSelectNotification} />
          </Card>
          <div className="flex-1 flex flex-col min-w-0 gap-3">
            <Card className="h-80 bg-gradient-to-b from-muted/20 to-muted/40 flex-shrink-0 overflow-hidden">
              <PhonePreview notification={selectedNotification} />
            </Card>
            <Card className="flex-1 min-h-0 overflow-hidden">
              <MapView notification={selectedNotification} />
            </Card>
          </div>
        </div>

        {/* 平板 md */}
        <div className="hidden md:flex lg:hidden flex-1 flex-col min-h-0 gap-3">
          <Card className="h-48 flex-shrink-0 overflow-hidden">
            <NotificationList notifications={notifications} selectedNotification={selectedNotification} onSelectNotification={handleSelectNotification} />
          </Card>
          <div className="flex-1 flex min-h-0 gap-3">
            <Card className="w-80 bg-gradient-to-b from-muted/20 to-muted/40 flex-shrink-0 overflow-hidden">
              <PhonePreview notification={selectedNotification} />
            </Card>
            <Card className="flex-1 min-w-0 overflow-hidden">
              <MapView notification={selectedNotification} />
            </Card>
          </div>
        </div>

        {/* 手機 */}
        <div className="flex md:hidden flex-1 flex-col min-h-0 gap-2">
          <Card className="h-[35%] flex-shrink-0 min-h-0 overflow-hidden">
            <NotificationList notifications={notifications} selectedNotification={selectedNotification} onSelectNotification={handleSelectNotification} />
          </Card>
          <Card className="flex-1 min-h-0 overflow-hidden rounded-none -mx-2 -mb-2">
            <MapView notification={selectedNotification} />
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen size="lg" message="載入中..." description="正在獲取通知資料" />}>
      <HomeContent />
    </Suspense>
  );
}
