'use client';

import { useState, useEffect, Suspense, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import NotificationList from '@/components/NotificationList';
import PhonePreview from '@/components/PhonePreview';
import MapView from '@/components/MapView';
import { NotificationRecord } from '@/types/notify';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RefreshCcw, AlertTriangle, BarChart3, Filter, X, ChevronDown, List as ListIcon, Map as MapIcon } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ThemeToggle } from '@/components/theme-toggle';
import Link from 'next/link';
import { TimeFilterComponent, useTimeFilter, TimeFilter, TIME_FILTER_OPTIONS, getDateBounds } from '@/components/TimeFilter';
import { DatePicker } from '@/components/DatePicker';
import { useFilteredNotifications } from '@/hooks/useFilteredNotifications';
import { NATIONWIDE_REGION } from '@/utils/regionMatcher';
import { cn } from '@/lib/utils';
import Image from 'next/image';

const DPIP_ICON_URL = 'https://raw.githubusercontent.com/ExpTechTW/DPIP-Pocket/refs/heads/main/assets/DPIP.png';
const DPIP_REPO_URL = 'https://github.com/ExpTechTW/DPIP-Pocket';

const CONTROL_SELECT = 'h-10 touch-manipulation appearance-none rounded-xl border border-border/60 bg-background/90 pl-3 pr-8 text-xs font-medium shadow-sm transition-[box-shadow,border-color] hover:border-border focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 sm:h-9';

// 選取一則通知後,給地圖這段時間播放運鏡(需與 MapView 的 fitBounds duration 同步)。
// 期間的點擊不立即切換,而是合併成「最後一個」,等運鏡結束再套用 → 避免使用者切換過快。
const MAP_ANIM_MS = 1100;

function DpipLogo({ size = 32 }: { size?: number }) {
  return (
    <button
      type="button"
      onClick={() => window.open(DPIP_REPO_URL, '_blank')}
      className="group relative shrink-0 rounded-xl p-0.5 ring-1 ring-border/50 transition hover:ring-primary/25"
    >
      <Image src={DPIP_ICON_URL} alt="DPIP" className="rounded-lg transition group-hover:scale-[1.02]" width={size} height={size} style={{ width: size, height: size }} />
    </button>
  );
}

function SelectWithChevron({ value, onChange, className, children }: {
  value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; className?: string; children: React.ReactNode;
}) {
  return (
    <div className="relative shrink-0">
      <select value={value} onChange={onChange} className={cn(CONTROL_SELECT, className)}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function RegionBadge({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="inline-flex max-w-[min(200px,55vw)] items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition hover:bg-primary/18 active:scale-[0.98]"
    >
      <Filter className="size-2.5 shrink-0 opacity-80" />
      <span className="truncate">{label}</span>
      <X className="size-2.5 shrink-0 opacity-70" />
    </button>
  );
}

function HomeContent() {
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const [selectedNotification, setSelectedNotification] = useState<NotificationRecord | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [throttled, setThrottled] = useState(false);  // 切換過快、選取被延後 → 清單顯示載入遮罩
  const busyRef = useRef(false);                        // 同步的忙碌閘門(運鏡冷卻中);用 ref 避免 render 落後造成競態
  const pendingSelectRef = useRef<NotificationRecord | null>(null);
  const busyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyRef = useRef<(n: NotificationRecord) => void>(() => {});
  const {
    timeFilter, startDate, endDate,
    handleTimeFilterChange, handleStartDateChange, handleEndDateChange, handleApplyTimeSlot,
  } = useTimeFilter();

  const {
    finalNotifications: notifications, regionData, timeFilteredNotifications, loading, error, refetch,
  } = useFilteredNotifications(regionFilter);

  const searchParams = useSearchParams();
  const router = useRouter();

  const analyticsUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (timeFilter !== 'all') {
      p.set('timeFilter', timeFilter);
      if (timeFilter === 'timeSlot' && startDate && endDate) { p.set('startDate', startDate); p.set('endDate', endDate); }
    }
    return p.toString() ? `/analytics?${p}` : '/analytics';
  }, [timeFilter, startDate, endDate]);

  useEffect(() => {
    const regionParam = searchParams.get('region');
    if (!regionParam) { setRegionFilter(null); setSelectedCity(null); setSelectedDistrict(null); return; }
    const decoded = decodeURIComponent(regionParam);
    setRegionFilter(decoded);
    if (decoded === NATIONWIDE_REGION) { setSelectedCity(decoded); setSelectedDistrict(null); return; }
    if (!regionData) return;
    if (Object.keys(regionData).includes(decoded)) { setSelectedCity(decoded); setSelectedDistrict(null); return; }
    for (const [city, districts] of Object.entries(regionData)) {
      for (const district of Object.keys(districts)) {
        if (`${city}${district}` === decoded) { setSelectedCity(city); setSelectedDistrict(decoded); return; }
      }
    }
  }, [searchParams, regionData]);

  useEffect(() => {
    if (!notifications.length) { setSelectedNotification(null); return; }
    // 僅在資料(notifications)變動時,依 URL 的 ?t 還原選取(deep-link / 重新整理 / 換時間範圍)。
    // 不可掛在 searchParams 上:點擊已直接 setSelectedNotification,若再隨每次 ?t 推送回放,
    // 高速連續切換時延遲/亂序抵達的 ?t 會反覆覆蓋選取,使選中狀態短暫跳動、與地圖不同步。
    const t = new URLSearchParams(window.location.search).get('t');
    if (t) {
      const ts = parseInt(t, 10);
      setSelectedNotification(notifications.find(n => n.timestamp === ts) || notifications[0]);
    } else {
      setSelectedNotification(notifications[0]);
    }
  }, [notifications]);

  const pushParams = useCallback((updater: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams);
    updater(p);
    router.push(`?${p}`, { scroll: false });
  }, [router, searchParams]);

  const applyAndCooldown = useCallback((n: NotificationRecord) => {
    setSelectedNotification(n);
    pushParams(p => p.set('t', n.timestamp.toString()));
    busyRef.current = true;
    if (busyTimerRef.current) clearTimeout(busyTimerRef.current);
    busyTimerRef.current = setTimeout(() => {
      // 冷卻結束:期間若累積了「最後意圖」就套用它並重新冷卻;否則解除忙碌、收起遮罩。
      // 由 timer(必定觸發)負責收尾,不靠會落後的 state,杜絕掉選取的競態。
      if (pendingSelectRef.current) {
        const p = pendingSelectRef.current;
        pendingSelectRef.current = null;
        applyRef.current(p);
      } else {
        busyRef.current = false;
        setThrottled(false);
      }
    }, MAP_ANIM_MS);
  }, [pushParams]);
  applyRef.current = applyAndCooldown;

  const handleSelectNotification = useCallback((n: NotificationRecord) => {
    // 運鏡冷卻中再點 → 記下「最後意圖」並顯示載入遮罩,等運鏡結束再套用(給地圖時間、避免過快切換)。
    if (busyRef.current) {
      pendingSelectRef.current = n;
      setThrottled(true);
      return;
    }
    applyAndCooldown(n);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) setMobileTab('map');
  }, [applyAndCooldown]);

  useEffect(() => () => { if (busyTimerRef.current) clearTimeout(busyTimerRef.current); }, []);

  const clearRegionFilter = useCallback(() => {
    setSelectedCity(null); setSelectedDistrict(null); setRegionFilter(null);
    pushParams(p => p.delete('region'));
  }, [pushParams]);

  const onCityChange = useCallback((city: string) => {
    setSelectedCity(city || null); setSelectedDistrict(null); setRegionFilter(city || null);
    pushParams(p => { if (city) p.set('region', encodeURIComponent(city)); else p.delete('region'); });
  }, [pushParams]);

  const onDistrictChange = useCallback((district: string) => {
    setSelectedDistrict(district || null); setRegionFilter(district || selectedCity);
    pushParams(p => {
      const r = district || selectedCity;
      if (r) p.set('region', encodeURIComponent(r)); else p.delete('region');
    });
  }, [pushParams, selectedCity]);

  const hasRegionFilter = selectedCity || selectedDistrict || regionFilter;
  const regionLabel = selectedDistrict || selectedCity || regionFilter || '';
  const recordCount = hasRegionFilter
    ? `${notifications.length} / ${timeFilteredNotifications.length}`
    : `${timeFilteredNotifications.length}`;

  const cityOptions = regionData ? Object.keys(regionData) : [];
  const districtOptions = selectedCity && regionData?.[selectedCity] ? Object.keys(regionData[selectedCity]) : [];
  const showDistricts = selectedCity && selectedCity !== NATIONWIDE_REGION && districtOptions.length > 0;

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 min-w-0 w-full max-w-[100dvw] flex-col overflow-x-hidden bg-gradient-to-b from-background via-background to-muted/35">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 flex-shrink-0 border-b border-border/50 bg-background/85 pt-[max(0.25rem,env(safe-area-inset-top))] shadow-sm shadow-black/[0.03] backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-background/75">

        {/* Mobile header */}
        <div className="home-mobile-only flex-col gap-2 px-3 pb-2.5 pt-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <DpipLogo size={36} />
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold tracking-tight">DPIP 通知紀錄</h1>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{recordCount} 筆</span>
                  {hasRegionFilter && <RegionBadge label={regionLabel} onClear={clearRegionFilter} />}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Link href={analyticsUrl} className="inline-flex size-11 items-center justify-center rounded-xl border border-border/60 bg-background/90 text-primary shadow-sm transition active:scale-95" aria-label="分析">
                <BarChart3 className="size-4" />
              </Link>
              <ThemeToggle />
              <button type="button" onClick={refetch} className="inline-flex size-11 items-center justify-center rounded-xl border border-border/60 bg-background/90 shadow-sm transition active:scale-95" aria-label="重新載入">
                <RefreshCcw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Mobile filters */}
          <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 [-webkit-overflow-scrolling:touch]">
            <SelectWithChevron value={timeFilter} onChange={e => handleTimeFilterChange(e.target.value as TimeFilter)} className="min-w-[5.5rem]">
              {TIME_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </SelectWithChevron>
            {regionData && (
              <>
                <SelectWithChevron value={selectedCity || ''} onChange={e => onCityChange(e.target.value)} className="w-full min-w-[6.5rem]">
                  <option value="">縣市</option>
                  <option value={NATIONWIDE_REGION}>全國廣播</option>
                  {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </SelectWithChevron>
                {showDistricts && (
                  <SelectWithChevron value={selectedDistrict || ''} onChange={e => onDistrictChange(e.target.value)} className="w-full min-w-[6.5rem]">
                    <option value="">鄉鎮區</option>
                    {districtOptions.map(d => <option key={d} value={`${selectedCity}${d}`}>{d}</option>)}
                  </SelectWithChevron>
                )}
              </>
            )}
          </div>

          {timeFilter === 'timeSlot' && (() => {
            const b = getDateBounds(startDate, endDate);
            return (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 bg-muted/25 p-2">
              <DatePicker value={startDate} min={b.startMin} max={b.startMax} onChange={handleStartDateChange} className="flex-1" />
              <span className="text-xs text-muted-foreground">—</span>
              <DatePicker value={endDate} min={b.endMin} max={b.endMax} onChange={handleEndDateChange} className="flex-1" />
              <Button type="button" size="sm" className="min-h-10 w-full rounded-xl sm:w-auto" disabled={!startDate || !endDate} onClick={handleApplyTimeSlot}>套用區間</Button>
            </div>
            );
          })()}
        </div>

        {/* Desktop header */}
        <div className="home-desktop-only flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <DpipLogo />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight">DPIP 通知紀錄</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{recordCount} 筆</span>
                {hasRegionFilter && <RegionBadge label={regionLabel} onClear={clearRegionFilter} />}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2 lg:flex-nowrap">
            <div className="min-w-0">
              <TimeFilterComponent timeFilter={timeFilter} startDate={startDate} endDate={endDate} onTimeFilterChange={handleTimeFilterChange} onStartDateChange={handleStartDateChange} onEndDateChange={handleEndDateChange} onApplyTimeSlot={handleApplyTimeSlot} />
            </div>

            {regionData && (
              <div className="hidden gap-2 md:flex">
                <SelectWithChevron value={selectedCity || ''} onChange={e => onCityChange(e.target.value)} className="w-full min-w-[7.5rem]">
                  <option value="">全部縣市</option>
                  <option value={NATIONWIDE_REGION}>全國廣播</option>
                  {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </SelectWithChevron>
                {showDistricts && (
                  <SelectWithChevron value={selectedDistrict || ''} onChange={e => onDistrictChange(e.target.value)} className="w-full min-w-[6.5rem] max-w-[10rem] truncate">
                    <option value="">全部鄉鎮區</option>
                    {districtOptions.map(d => <option key={d} value={`${selectedCity}${d}`}>{d}</option>)}
                  </SelectWithChevron>
                )}
              </div>
            )}

            <div className="hidden h-7 w-px bg-border/60 sm:block" />

            <Link href={analyticsUrl} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/90 px-3 text-xs font-semibold shadow-sm transition hover:border-primary/25 hover:bg-accent/60">
              <BarChart3 className="size-3.5 text-primary/90" />
              <span className="hidden sm:inline">分析</span>
            </Link>
            <ThemeToggle />
            <button type="button" onClick={refetch} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/90 px-3 text-xs font-semibold shadow-sm transition hover:border-primary/25 hover:bg-accent/60">
              <RefreshCcw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">重整</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden p-2 pb-1 sm:gap-3 sm:p-3 md:flex-row md:pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:gap-4 lg:p-4">
        {loading && (
          <LoadingSpinner overlay size="md" message="載入通知資料中..." description="正在獲取通知資料" />
        )}

        {error && !loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/75 p-4 backdrop-blur-md">
            <div className="max-w-sm rounded-2xl border border-destructive/20 bg-card/95 p-6 text-center shadow-lg shadow-black/10">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-destructive/10">
                <AlertTriangle className="size-6 text-destructive" />
              </div>
              <p className="text-sm font-medium">{error}</p>
              <Button onClick={refetch} size="sm" className="mt-4 gap-2 rounded-xl"><RefreshCcw className="size-3.5" />重試</Button>
            </div>
          </div>
        )}

        {/* Desktop: xl 三欄 */}
        <div className="home-desktop-only min-h-0 min-w-0 flex-1 flex-row">
          <div className="home-xl-three-col min-h-0 min-w-0 w-full flex-1 gap-3 overflow-hidden">
            <Card className="h-full w-80 min-w-0 flex-shrink-0 !gap-0 !py-0">
              <NotificationList notifications={notifications} selectedNotification={selectedNotification} onSelectNotification={handleSelectNotification} busy={throttled} />
            </Card>
            <Card className="flex h-full w-[min(22rem,32vw)] max-w-[450px] min-w-0 flex-shrink-0 !gap-0 !py-0 overflow-hidden bg-gradient-to-b from-primary/[0.06] via-muted/25 to-muted/45">
              <PhonePreview notification={selectedNotification} />
            </Card>
            <Card className="min-h-0 min-w-0 flex-1 !gap-0 !py-0 overflow-hidden">
              <MapView notification={selectedNotification} />
            </Card>
          </div>

          {/* md~xl 兩欄 */}
          <div className="home-tablet-two-col min-h-0 min-w-0 w-full flex-1 gap-2 overflow-hidden sm:gap-3">
            <Card className="flex h-full w-[min(100%,18rem)] min-w-[10.5rem] max-w-[20rem] flex-shrink-0 !gap-0 !py-0 md:w-64 lg:w-72">
              <NotificationList notifications={notifications} selectedNotification={selectedNotification} onSelectNotification={handleSelectNotification} busy={throttled} />
            </Card>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden sm:gap-3">
              <Card className="flex h-[min(36vh,22rem)] max-h-[min(42vh,26rem)] min-h-[11rem] flex-shrink-0 !gap-0 !py-0 overflow-hidden bg-gradient-to-b from-primary/[0.06] via-muted/25 to-muted/45">
                <PhonePreview notification={selectedNotification} />
              </Card>
              <Card className="min-h-0 min-w-0 flex-1 !gap-0 !py-0 overflow-hidden">
                <MapView notification={selectedNotification} />
              </Card>
            </div>
          </div>
        </div>

        {/* Mobile */}
        <div className="home-mobile-only min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-0.5 sm:px-1">
            <Card className="flex h-full min-h-0 min-w-0 flex-1 flex-col !gap-0 !py-0 overflow-hidden rounded-2xl border-border/60 shadow-md">
              {mobileTab === 'list'
                ? <NotificationList notifications={notifications} selectedNotification={selectedNotification} onSelectNotification={handleSelectNotification} busy={throttled} />
                : <MapView notification={selectedNotification} />
              }
            </Card>
          </div>
          <nav className="flex shrink-0 gap-1 border-t border-border/50 bg-background/95 px-2 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] backdrop-blur-md supports-[backdrop-filter]:bg-background/85" aria-label="檢視模式">
            {([['list', ListIcon, '列表'], ['map', MapIcon, '地圖']] as const).map(([tab, Icon, label]) => (
              <button
                key={tab}
                type="button"
                className={cn(
                  'flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition active:scale-[0.98]',
                  mobileTab === tab ? 'bg-primary/12 text-primary' : 'text-muted-foreground',
                )}
                aria-current={mobileTab === tab ? 'page' : undefined}
                onClick={() => setMobileTab(tab)}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </button>
            ))}
          </nav>
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
