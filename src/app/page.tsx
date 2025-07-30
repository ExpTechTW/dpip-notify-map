'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useLimitContext } from '@/contexts/LimitContext';
import NotificationList from '@/components/NotificationList';
import PhonePreview from '@/components/PhonePreview';
import MapView from '@/components/MapView';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationRecord } from '@/types/notify';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RefreshCcw, AlertTriangle, Loader2, Shield, BarChart3, Filter, X } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import Link from 'next/link';

function isPointInPolygon(point: [number, number], polygon: number[][][]): boolean {
  const [x, y] = point;
  
  for (const ring of polygon) {
    let inside = false;
    let j = ring.length - 1;
    
    for (let i = 0; i < ring.length; i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
      j = i;
    }
    
    if (inside) return true;
  }
  
  return false;
}

function HomeContent() {
  const { limitSetting, setLimitSetting } = useLimitContext();
  const { notifications, loading, error, refetch } = useNotifications(limitSetting);
  const [selectedNotification, setSelectedNotification] = useState<NotificationRecord | null>(null);
  const [filteredNotifications, setFilteredNotifications] = useState<NotificationRecord[]>([]);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [regionData, setRegionData] = useState<Record<string, Record<string, { code: number; lat: number; lon: number; site: number; area: string }>> | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // 從 URL 參數讀取各種篩選條件
  useEffect(() => {
    const regionParam = searchParams.get('region');
    const limitParam = searchParams.get('limit');
    const timeFilterParam = searchParams.get('timeFilter');
    
    console.log('URL 參數:', { regionParam, limitParam, timeFilterParam });
    
    // 處理地區篩選
    if (regionParam) {
      const decodedRegion = decodeURIComponent(regionParam);
      console.log('設定地區篩選:', decodedRegion);
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
    
    // 處理限制數量設定
    if (limitParam) {
      const limitValue = limitParam === 'all' ? 'all' : parseInt(limitParam, 10);
      if (limitValue !== limitSetting) {
        console.log('設定限制數量:', limitValue);
        setLimitSetting(limitValue);
      }
    }
  }, [searchParams, limitSetting, setLimitSetting, regionData]);

  // 載入地區數據
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/ExpTechTW/dpip-notify-map/refs/heads/main/public/region.json')
      .then(res => res.json())
      .then(data => setRegionData(data))
      .catch(err => console.error('Failed to load region data:', err));
  }, []);

  // 優化的地區篩選函數
  const filterNotificationsByRegion = useCallback((targetRegion: string) => {
    if (!regionData) {
      console.warn('Region data not loaded yet');
      setFilteredNotifications([]);
      return;
    }

    // 預先計算目標地區的代碼和座標
    const targetCodes: number[] = [];
    let targetCoordinates: [number, number] | null = null;
      
    for (const [city, districts] of Object.entries(regionData)) {
      for (const [district, data] of Object.entries(districts)) {
        const fullName = `${city}${district}`;
        if (fullName === targetRegion || city === targetRegion) {
          targetCodes.push(data.code);
          if (!targetCoordinates) {
            targetCoordinates = [data.lon, data.lat];
          }
        }
      }
    }

    console.log('地區篩選:', { targetRegion, targetCodes, targetCoordinates });

    // 篩選通知
    const filtered = notifications.filter(notification => {
      // 1. 檢查標題是否包含地區名稱
      if (notification.title.includes(targetRegion)) {
        return true;
      }
      
      // 2. 檢查地區代碼
      if (targetCodes.length > 0 && notification.codes.some(code => targetCodes.includes(code))) {
        return true;
      }
      
      // 3. 檢查 Polygon 是否包含該地區
      if (targetCoordinates && notification.Polygons.length > 0) {
        return notification.Polygons.some(polygon => {
          const coordinates = 'coordinates' in polygon ? polygon.coordinates : polygon.geometry.coordinates;
          return isPointInPolygon(targetCoordinates!, coordinates);
        });
      }
      
      return false;
    });

    console.log('篩選結果:', {
      總通知數: notifications.length,
      符合條件: filtered.length,
      符合通知: filtered.slice(0, 3).map(n => ({ timestamp: n.timestamp, title: n.title }))
    });

    setFilteredNotifications(filtered);
  }, [notifications, regionData]);

  // 根據地區篩選通知
  useEffect(() => {
    if (!notifications.length) {
      setFilteredNotifications([]);
      return;
    }

    // 如果選擇了特定地區
    if (selectedCity || selectedDistrict || regionFilter) {
      const targetRegion = selectedDistrict || selectedCity || regionFilter;
      
      console.log('篩選條件:', { selectedCity, selectedDistrict, regionFilter, targetRegion });
      
      // 處理特殊的篩選條件
      if (targetRegion === '全部(不指定地區的全部用戶廣播通知)') {
        // 先檢查所有通知的結構來理解數據
        console.log('檢查前10個通知的結構:', notifications.slice(0, 10).map(n => ({
          timestamp: n.timestamp,
          title: n.title,
          codes: n.codes,
          codesLength: n.codes.length,
          polygons: n.Polygons.length,
          polygonTypes: n.Polygons.map(p => typeof p)
        })));
        
        // 嘗試不同的篩選條件
        const noCodes = notifications.filter(n => n.codes.length === 0);
        const noPolygons = notifications.filter(n => n.Polygons.length === 0);
        const bothEmpty = notifications.filter(n => n.codes.length === 0 && n.Polygons.length === 0);
        const titleContainsBroadcast = notifications.filter(n => 
          n.title.includes('全部') || n.title.includes('廣播') || n.title.includes('通知')
        );
        
        // 檢查沒有codes的通知的詳細內容
        console.log('沒有codes的通知詳細內容 (前5個):', noCodes.slice(0, 5).map(n => ({
          timestamp: n.timestamp,
          title: n.title,
          body: n.body,
          codes: n.codes,
          polygons: n.Polygons.length,
          critical: n.critical
        })));
        
        console.log('不同篩選條件的結果:', {
          總通知數: notifications.length,
          沒有codes: noCodes.length,
          沒有polygons: noPolygons.length,
          codes和polygons都空: bothEmpty.length,
          標題包含廣播詞彙: titleContainsBroadcast.length
        });
        
        // 全國廣播：無codes和polygons，或codes不包含數字（非{topic}-{region code}格式）
        const broadcastNotifications = notifications.filter(n => {
          if (n.codes.length === 0 && n.Polygons.length === 0) return true;
          if (n.codes.length > 0 && n.Polygons.length === 0) {
            return !n.codes.some(code => /\d+/.test(String(code)));
          }
          return false;
        });
        
        console.log('廣播通知篩選結果:', {
          廣播通知數: broadcastNotifications.length,
          前3個廣播通知: broadcastNotifications.slice(0, 3).map(n => ({ 
            timestamp: n.timestamp, 
            title: n.title, 
            codes: n.codes, 
            polygons: n.Polygons.length 
          }))
        });
        
        setFilteredNotifications(broadcastNotifications);
        return;
      }
      
      // 處理"其他地區"篩選條件 - 有地區代碼但無法匹配的通知
      if (targetRegion === '其他地區') {
        const otherRegionNotifications = notifications.filter(notification => {
          if (!regionData || notification.codes.length === 0) return false;
          
          // 檢查是否有數字格式的地區代碼但無法匹配
          const hasRegionCode = notification.codes.some(code => /\d+/.test(String(code)));
          if (!hasRegionCode) return false;
          
          // 檢查是否匹配任何已知地區
          const hasMatch = notification.codes.some(code => {
            return Object.values(regionData).some(districts => 
              Object.values(districts).some(data => data.code === code)
            );
          }) || Object.keys(regionData).some(city => notification.title.includes(city));
          
          return !hasMatch;
        });
        
        setFilteredNotifications(otherRegionNotifications);
        return;
      }
      
      // 處理"未知區域廣播"篩選條件 - 有多邊形但無已知地區匹配
      if (targetRegion === '未知區域廣播') {
        const unknownRegionNotifications = notifications.filter(notification => {
          return notification.Polygons.length > 0 && 
                 (!regionData || !Object.keys(regionData).some(city => notification.title.includes(city)));
        });
        
        setFilteredNotifications(unknownRegionNotifications);
        return;
      }
      
      if (targetRegion) {
        filterNotificationsByRegion(targetRegion);
      }
    } else {
      setFilteredNotifications(notifications);
    }
  }, [notifications, selectedCity, selectedDistrict, regionFilter, filterNotificationsByRegion, regionData]);

  // 從 URL 參數讀取 timestamp 並設置選中的通知
  useEffect(() => {
    const workingNotifications = (selectedCity || selectedDistrict || regionFilter) ? filteredNotifications : notifications;
    
    if (workingNotifications.length === 0) {
      setSelectedNotification(null);
      return;
    }

    const timestampParam = searchParams.get('t');
    
    if (timestampParam) {
      const timestampNumber = parseInt(timestampParam, 10);
      const notification = workingNotifications.find(n => n.timestamp === timestampNumber);
      
      if (notification) {
        console.log('選中通知 (URL參數):', { timestamp: notification.timestamp, title: notification.title });
        setSelectedNotification(notification);
      } else {
        console.log('URL參數通知未找到，選擇第一個:', workingNotifications[0]?.title);
        setSelectedNotification(workingNotifications[0]);
      }
    } else {
      console.log('選擇第一個通知:', workingNotifications[0]?.title);
      setSelectedNotification(workingNotifications[0]);
    }
  }, [notifications, filteredNotifications, selectedCity, selectedDistrict, regionFilter, searchParams]);
  
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">載入中...</p>
        </div>
      </div>
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
            <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-foreground">DPIP 通知發送紀錄</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  {(selectedCity || selectedDistrict || regionFilter) ? `${filteredNotifications.length} / ${notifications.length}` : notifications.length} 筆通知紀錄
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
            <div className="hidden md:flex gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={limitSetting === 100 ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLimitSetting(100)}
              >
                100
              </Button>
              <Button
                variant={limitSetting === 500 ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLimitSetting(500)}
              >
                500
              </Button>
              <Button
                variant={limitSetting === 1000 ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLimitSetting(1000)}
              >
                1000
              </Button>
              <Button
                variant={limitSetting === 'all' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLimitSetting('all')}
              >
                全部
              </Button>
            </div>
            
            {regionData && (
              <div className="hidden lg:flex gap-1">
                <select 
                  value={selectedCity || ''} 
                  onChange={(e) => {
                    const city = e.target.value;
                    setSelectedCity(city || null);
                    setSelectedDistrict(null);
                    setRegionFilter(null);
                    
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
                      setRegionFilter(null);
                      
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
            
            <Link href="/analytics">
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
              notifications={(selectedCity || selectedDistrict || regionFilter) ? filteredNotifications : notifications}
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
              notifications={(selectedCity || selectedDistrict || regionFilter) ? filteredNotifications : notifications}
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
              notifications={(selectedCity || selectedDistrict || regionFilter) ? filteredNotifications : notifications}
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
              notifications={(selectedCity || selectedDistrict || regionFilter) ? filteredNotifications : notifications}
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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          <h2 className="text-xl font-semibold">載入中...</h2>
          <p className="text-sm text-muted-foreground">正在獲取通知資料</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
