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
import { RefreshCcw, AlertTriangle, Shield, BarChart3, Filter, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ThemeToggle } from '@/components/theme-toggle';
import Link from 'next/link';
import { useRegionData } from '@/hooks/useRegionData';
import { TimeFilterComponent, useTimeFilter, TimeFilter } from '@/components/TimeFilter';
import { useFilteredNotifications } from '@/hooks/useFilteredNotifications';
import Image from 'next/image';


function HomeContent() {
  const { limitSetting, updateLimit } = useLimitSync();
  const [selectedNotification, setSelectedNotification] = useState<NotificationRecord | null>(null);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const { regionData } = useRegionData();
  const {
    timeFilter,
    startDate,
    endDate,
    handleTimeFilterChange,
    handleStartDateChange,
    handleEndDateChange,
    handleApplyTimeSlot
  } = useTimeFilter();
  
  // 使用統一的數據處理hook
  const { 
    finalNotifications: notifications,
    timeFilteredNotifications,
    loading, 
    error, 
    refetch 
  } = useFilteredNotifications(regionFilter);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // 建構分析頁面的 URL，保留時間篩選和數量參數
  const analyticsUrl = useMemo(() => {
    const params = new URLSearchParams();
    
    // 保留時間篩選參數
    if (timeFilter !== 'all') {
      params.set('timeFilter', timeFilter);
      if (timeFilter === 'timeSlot' && startDate && endDate) {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      }
    }
    
    // 保留數量限制參數
    if (limitSetting !== 100) {
      params.set('limit', limitSetting.toString());
    }
    
    return params.toString() ? `/analytics?${params.toString()}` : '/analytics';
  }, [timeFilter, startDate, endDate, limitSetting]);
  
  // 從 URL 參數讀取各種篩選條件
  useEffect(() => {
    const regionParam = searchParams.get('region');
    
    // 處理地區篩選
    if (regionParam) {
      const decodedRegion = decodeURIComponent(regionParam);
      setRegionFilter(decodedRegion);
      
      // 同時更新UI篩選狀態
      if (decodedRegion === '全部(不指定地區的全部用戶廣播通知)') {
        setSelectedCity(decodedRegion);
        setSelectedDistrict(null);
      } else if (regionData) {
        // 檢查是否為縣市
        if (Object.keys(regionData).includes(decodedRegion)) {
          setSelectedCity(decodedRegion);
          setSelectedDistrict(null);
        } else {
          // 檢查是否為鄉鎮區
          for (const [city, districts] of Object.entries(regionData)) {
            for (const district of Object.keys(districts)) {
              if (`${city}${district}` === decodedRegion) {
                setSelectedCity(city);
                setSelectedDistrict(decodedRegion);
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


  // 從 URL 參數讀取 timestamp 並設置選中的通知
  useEffect(() => {
    const workingNotifications = notifications;
    
    if (workingNotifications.length === 0) {
      setSelectedNotification(null);
      return;
    }

    const timestampParam = searchParams.get('t');
    
    if (timestampParam) {
      const timestampNumber = parseInt(timestampParam, 10);
      const notification = workingNotifications.find(n => n.timestamp === timestampNumber);
      
      if (notification) {
        setSelectedNotification(notification);
      } else {
        setSelectedNotification(workingNotifications[0]);
      }
    } else {
      setSelectedNotification(workingNotifications[0]);
    }
  }, [notifications, searchParams]);
  
  // 更新 URL 當選擇不同通知
  const handleSelectNotification = (notification: NotificationRecord) => {
    setSelectedNotification(notification);
    // 更新 URL 參數（統一使用字串格式）
    const params = new URLSearchParams(searchParams);
    params.set('t', notification.timestamp.toString());
    router.push(`?${params.toString()}`, { scroll: false });
  };

  if (loading) {
    return (
      <LoadingSpinner 
        fullScreen 
        message="載入中..." 
        description="正在獲取通知資料" 
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-4" />
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={refetch} size="sm" className="gap-2">
            <RefreshCcw className="w-3.5 h-3.5" />
            重試
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* 標題列 */}
      <header className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/50 px-4 sm:px-6 py-3 shadow-sm flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="flex-shrink-0">
            <Image 
                src="https://raw.githubusercontent.com/ExpTechTW/DPIP-Pocket/refs/heads/main/assets/DPIP.png" 
                alt="DPIP Logo" 
                className="rounded-md object-cover"
                width={40}
                height={40}
                onClick={() => {
                  window.open('https://github.com/ExpTechTW/DPIP-Pocket', '_blank');
                }}
              />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-foreground">DPIP 通知發送紀錄</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {(selectedCity || selectedDistrict || regionFilter) ? `${notifications.length} / ${timeFilteredNotifications.length}` : timeFilteredNotifications.length} 筆通知紀錄
                </p>
                {(selectedCity || selectedDistrict || regionFilter) && (
                  <div className="flex items-center gap-1">
                    <Filter className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {selectedDistrict || selectedCity || regionFilter}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedCity(null);
                        setSelectedDistrict(null);
                        setRegionFilter(null);
                        const params = new URLSearchParams(searchParams);
                        params.delete('region');
                        router.push(`/?${params.toString()}`, { scroll: false });
                      }}
                      className="h-4 w-4 p-0"
                    >
                      <X className="w-2 h-2" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* 時間篩選器 */}
            <div className="hidden lg:block">
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
            
            {/* 手機版時間篩選器 - 更簡化的版本 */}
            <div className="lg:hidden">
              <select 
                value={timeFilter} 
                onChange={(e) => handleTimeFilterChange(e.target.value as TimeFilter)}
                className="text-xs border rounded px-2 py-1 bg-background"
              >
                <option value="recent24h">近24h</option>
                <option value="all">全部</option>
                <option value="timeSlot">自定義</option>
              </select>
            </div>
            
            <div className="hidden md:flex gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={limitSetting === 100 ? 'default' : 'ghost'}
                size="sm"
                onClick={() => updateLimit(100)}
              >
                100
              </Button>
              <Button
                variant={limitSetting === 500 ? 'default' : 'ghost'}
                size="sm"
                onClick={() => updateLimit(500)}
              >
                500
              </Button>
              <Button
                variant={limitSetting === 1000 ? 'default' : 'ghost'}
                size="sm"
                onClick={() => updateLimit(1000)}
              >
                1000
              </Button>
              <Button
                variant={limitSetting === 'all' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => updateLimit('all')}
              >
                全部
              </Button>
            </div>
            
            {regionData && (
              <div className="hidden md:flex gap-1">
                <select 
                  value={selectedCity || ''} 
                  onChange={(e) => {
                    const city = e.target.value;
                    setSelectedCity(city || null);
                    setSelectedDistrict(null);
                    setRegionFilter(city || null);
                    
                    // 更新URL參數
                    const params = new URLSearchParams(searchParams);
                    if (city) {
                      params.set('region', encodeURIComponent(city));
                    } else {
                      params.delete('region');
                    }
                    router.push(`/?${params.toString()}`, { scroll: false });
                  }}
                  className="text-xs border rounded px-2 py-1 bg-background"
                >
                  <option value="">全部縣市</option>
                  <option value="全部(不指定地區的全部用戶廣播通知)">📢 全國廣播</option>
                  {Object.keys(regionData).map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
                
                {selectedCity && selectedCity !== '全部(不指定地區的全部用戶廣播通知)' && (
                  <select 
                    value={selectedDistrict || ''} 
                    onChange={(e) => {
                      const district = e.target.value;
                      setSelectedDistrict(district || null);
                      setRegionFilter(district || selectedCity);
                      
                      // 更新URL參數
                      const params = new URLSearchParams(searchParams);
                      if (district) {
                        params.set('region', encodeURIComponent(district));
                      } else if (selectedCity) {
                        params.set('region', encodeURIComponent(selectedCity));
                      } else {
                        params.delete('region');
                      }
                      router.push(`/?${params.toString()}`, { scroll: false });
                    }}
                    className="text-xs border rounded px-2 py-1 bg-background"
                  >
                    <option value="">全部鄉鎮區</option>
                    {Object.keys(regionData[selectedCity] || {}).map(district => (
                      <option key={district} value={`${selectedCity}${district}`}>
                        {district}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            
            <Link href={analyticsUrl}>
              <Button variant="outline" size="sm" className="gap-2">
                <BarChart3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">統計分析</span>
              </Button>
            </Link>
            <ThemeToggle />
            <Button onClick={refetch} variant="outline" size="sm" className="gap-2">
              <RefreshCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">重新整理</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0 p-2 sm:p-3 lg:p-4 gap-2 sm:gap-3 lg:gap-4">
        {/* 桌面版佈局 (1400px+) */}
        <div className="hidden xl:flex flex-1 min-h-0 gap-4">
          <Card className="w-80 flex-shrink-0 overflow-hidden">
            <NotificationList
              notifications={notifications}
              selectedNotification={selectedNotification}
              onSelectNotification={handleSelectNotification}
            />
          </Card>
          <Card className="w-[450px] bg-gradient-to-b from-muted/20 to-muted/40 flex-shrink-0 overflow-hidden">
            <PhonePreview notification={selectedNotification} />
          </Card>
          <Card className="flex-1 min-w-0 overflow-hidden">
            <MapView notification={selectedNotification} />
          </Card>
        </div>

        {/* 大平板版佈局 (1024px - 1399px) */}
        <div className="hidden lg:flex xl:hidden flex-1 min-h-0 gap-3">
          <Card className="w-72 flex-shrink-0 overflow-hidden">
            <NotificationList
              notifications={notifications}
              selectedNotification={selectedNotification}
              onSelectNotification={handleSelectNotification}
            />
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

        {/* 平板版佈局 (768px - 1023px) */}
        <div className="hidden md:flex lg:hidden flex-1 flex-col min-h-0 gap-3">
          <Card className="h-48 flex-shrink-0 overflow-hidden">
            <NotificationList
              notifications={notifications}
              selectedNotification={selectedNotification}
              onSelectNotification={handleSelectNotification}
            />
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

        {/* 手機版佈局 (< 768px) - 隱藏 iPhone 預覽 */}
        <div className="flex md:hidden flex-1 flex-col min-h-0 gap-2">
          <Card className="h-[35%] flex-shrink-0 min-h-0 overflow-hidden">
            <NotificationList
              notifications={notifications}
              selectedNotification={selectedNotification}
              onSelectNotification={handleSelectNotification}
            />
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
    <Suspense fallback={
      <LoadingSpinner 
        fullScreen 
        size="lg"
        message="載入中..." 
        description="正在獲取通知資料" 
      />
    }>
      <HomeContent />
    </Suspense>
  );
}
