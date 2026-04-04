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

  const controlSelect =
    'h-9 appearance-none rounded-xl border border-border/60 bg-background/90 pl-3 pr-8 text-xs font-medium shadow-sm transition-[box-shadow,border-color] hover:border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30';

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/35">
      <header className="sticky top-0 z-30 flex-shrink-0 border-b border-border/50 bg-background/80 px-3 py-2.5 shadow-sm shadow-black/[0.03] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/70 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => window.open('https://github.com/ExpTechTW/DPIP-Pocket', '_blank')}
              className="group relative flex-shrink-0 rounded-xl p-0.5 ring-1 ring-border/50 transition hover:ring-primary/25"
            >
              <Image
                src="https://raw.githubusercontent.com/ExpTechTW/DPIP-Pocket/refs/heads/main/assets/DPIP.png"
                alt="DPIP"
                className="size-8 rounded-lg transition group-hover:scale-[1.02]"
                width={32}
                height={32}
              />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-foreground">DPIP 通知紀錄</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{recordCount} 筆</span>
                {hasRegionFilter && (
                  <button
                    type="button"
                    onClick={clearRegionFilter}
                    className="inline-flex max-w-[min(180px,50vw)] items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary transition hover:bg-primary/18"
                  >
                    <Filter className="size-2.5 shrink-0 opacity-80" />
                    <span className="truncate">{selectedDistrict || selectedCity || regionFilter}</span>
                    <X className="size-2.5 shrink-0 opacity-70" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
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
            <div className="relative lg:hidden">
              <select
                value={timeFilter}
                onChange={(e) => handleTimeFilterChange(e.target.value as TimeFilter)}
                className={controlSelect}
              >
                <option value="recent12h">12h</option>
                <option value="recent24h">24h</option>
                <option value="all">全部</option>
                <option value="timeSlot">自定義</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>

            <div className="hidden items-center rounded-xl border border-border/50 bg-muted/35 p-1 md:flex">
              {LIMIT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateLimit(opt.value)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                    limitSetting === opt.value
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-black/[0.04] dark:ring-white/10'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {regionData && (
              <div className="hidden gap-2 md:flex">
                <div className="relative min-w-[7.5rem]">
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
                    className={`${controlSelect} w-full min-w-0`}
                  >
                    <option value="">全部縣市</option>
                    <option value="全部(不指定地區的全部用戶廣播通知)">全國廣播</option>
                    {Object.keys(regionData).map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>

                {selectedCity && selectedCity !== '全部(不指定地區的全部用戶廣播通知)' && (
                  <div className="relative min-w-[6.5rem] max-w-[10rem]">
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
                      className={`${controlSelect} w-full min-w-0 truncate`}
                    >
                      <option value="">全部鄉鎮區</option>
                      {Object.keys(regionData[selectedCity] || {}).map(d => (
                        <option key={d} value={`${selectedCity}${d}`}>{d}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  </div>
                )}
              </div>
            )}

            <div className="hidden h-7 w-px bg-border/60 sm:block" />

            <Link
              href={analyticsUrl}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/90 px-3 text-xs font-semibold shadow-sm transition hover:border-primary/25 hover:bg-accent/60"
            >
              <BarChart3 className="size-3.5 text-primary/90" />
              <span className="hidden sm:inline">分析</span>
            </Link>
            <ThemeToggle />
            <button
              type="button"
              onClick={refetch}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/90 px-3 text-xs font-semibold shadow-sm transition hover:border-primary/25 hover:bg-accent/60"
            >
              <RefreshCcw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">重整</span>
            </button>
          </div>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 gap-2 overflow-hidden p-2 sm:gap-3 sm:p-3 lg:gap-4 lg:p-4">
        {loading && (
          <LoadingSpinner
            overlay size="md"
            message="載入通知資料中..."
            description={`正在獲取${limitSetting === 'all' ? '全部' : ` ${limitSetting} 筆`}資料`}
          />
        )}

        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/75 p-4 backdrop-blur-md">
            <div className="max-w-sm rounded-2xl border border-destructive/20 bg-card/95 p-6 text-center shadow-lg shadow-black/10">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-destructive/10">
                <AlertTriangle className="size-6 text-destructive" />
              </div>
              <p className="text-sm font-medium text-foreground">{error}</p>
              <Button onClick={refetch} size="sm" className="mt-4 gap-2 rounded-xl">
                <RefreshCcw className="size-3.5" />
                重試
              </Button>
            </div>
          </div>
        )}

        <div className="hidden min-h-0 flex-1 gap-3 xl:flex">
          <Card className="h-full w-80 flex-shrink-0 !gap-0 !py-0">
            <NotificationList notifications={notifications} selectedNotification={selectedNotification} onSelectNotification={handleSelectNotification} />
          </Card>
          <Card className="h-full w-[450px] flex-shrink-0 !gap-0 !py-0 bg-gradient-to-b from-primary/[0.06] via-muted/25 to-muted/45">
            <PhonePreview notification={selectedNotification} />
          </Card>
          <Card className="min-w-0 flex-1 !gap-0 !py-0">
            <MapView notification={selectedNotification} />
          </Card>
        </div>

        <div className="hidden min-h-0 flex-1 gap-3 lg:flex xl:hidden">
          <Card className="h-full w-72 flex-shrink-0 !gap-0 !py-0">
            <NotificationList notifications={notifications} selectedNotification={selectedNotification} onSelectNotification={handleSelectNotification} />
          </Card>
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Card className="h-80 flex-shrink-0 !gap-0 !py-0 bg-gradient-to-b from-primary/[0.06] via-muted/25 to-muted/45">
              <PhonePreview notification={selectedNotification} />
            </Card>
            <Card className="min-h-0 flex-1 !gap-0 !py-0">
              <MapView notification={selectedNotification} />
            </Card>
          </div>
        </div>

        <div className="hidden min-h-0 flex-1 flex-col gap-3 md:flex lg:hidden">
          <Card className="h-48 flex-shrink-0 !gap-0 !py-0">
            <NotificationList notifications={notifications} selectedNotification={selectedNotification} onSelectNotification={handleSelectNotification} />
          </Card>
          <div className="flex min-h-0 flex-1 gap-3">
            <Card className="w-80 flex-shrink-0 !gap-0 !py-0 bg-gradient-to-b from-primary/[0.06] via-muted/25 to-muted/45">
              <PhonePreview notification={selectedNotification} />
            </Card>
            <Card className="min-w-0 flex-1 !gap-0 !py-0">
              <MapView notification={selectedNotification} />
            </Card>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 md:hidden">
          <Card className="h-[35%] min-h-0 flex-shrink-0 !gap-0 !py-0">
            <NotificationList notifications={notifications} selectedNotification={selectedNotification} onSelectNotification={handleSelectNotification} />
          </Card>
          <Card className="min-h-0 flex-1 !gap-0 !py-0 overflow-hidden rounded-2xl">
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
