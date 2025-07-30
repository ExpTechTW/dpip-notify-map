'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
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
  const { notifications, loading, error, refetch } = useNotifications();
  const [selectedNotification, setSelectedNotification] = useState<NotificationRecord | null>(null);
  const [filteredNotifications, setFilteredNotifications] = useState<NotificationRecord[]>([]);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // 從 URL 參數讀取 region 和地區篩選
  useEffect(() => {
    const regionParam = searchParams.get('region');
    if (regionParam) {
      setRegionFilter(decodeURIComponent(regionParam));
    } else {
      setRegionFilter(null);
    }
  }, [searchParams]);

  // 根據地區篩選通知
  useEffect(() => {
    if (!notifications.length) {
      setFilteredNotifications([]);
      return;
    }

    if (!regionFilter) {
      setFilteredNotifications(notifications);
      return;
    }

    const fetchRegionData = async () => {
      try {
        const response = await fetch('/region.json');
        const regionData = await response.json();
        
        // 找到目標地區的代碼
        const targetCodes: number[] = [];
        let targetCoordinates: [number, number] | null = null;
        
        Object.entries(regionData as Record<string, Record<string, { code: number; lat: number; lon: number; site: number; area: string }>>).forEach(([city, districts]) => {
          Object.entries(districts).forEach(([district, data]) => {
            const fullName = `${city}${district}`;
            if (fullName === regionFilter) {
              targetCodes.push(data.code);
              targetCoordinates = [data.lon, data.lat];
            }
          });
        });

        // 篩選包含指定地區的通知
        const filtered = notifications.filter(notification => {
          // 1. 檢查標題是否包含地區名稱
          if (notification.title.includes(regionFilter)) {
            return true;
          }
          
          // 2. 檢查地區代碼
          if (targetCodes.some(code => notification.codes.includes(code))) {
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

        setFilteredNotifications(filtered);
      } catch (error) {
        console.error('Failed to load region data for filtering:', error);
        // 如果無法載入地區資料，則使用簡單的標題匹配
        const filtered = notifications.filter(notification => 
          notification.title.includes(regionFilter)
        );
        setFilteredNotifications(filtered);
      }
    };

    fetchRegionData();
  }, [notifications, regionFilter]);

  // 從 URL 參數讀取 timestamp 並設置選中的通知
  useEffect(() => {
    const workingNotifications = regionFilter ? filteredNotifications : notifications;
    
    if (workingNotifications.length > 0) {
      const timestampParam = searchParams.get('t');
      if (timestampParam) {
        // 將參數轉換為數字進行比較
        const timestampNumber = parseInt(timestampParam, 10);
        // 找到對應的通知
        const notification = workingNotifications.find(n => n.timestamp === timestampNumber);
        
        if (notification) {
          setSelectedNotification(notification);
        } else {
          // 如果找不到，選擇第一個通知
          setSelectedNotification(workingNotifications[0]);
        }
      } else {
        // 沒有參數時，選擇第一個通知
        setSelectedNotification(workingNotifications[0]);
      }
    }
  }, [notifications, filteredNotifications, regionFilter, searchParams]);
  
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
                  {regionFilter ? `${filteredNotifications.length} / ${notifications.length}` : notifications.length} 筆通知紀錄
                </p>
                {regionFilter && (
                  <div className="flex items-center gap-1">
                    <Filter className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{regionFilter}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
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
              notifications={regionFilter ? filteredNotifications : notifications}
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
              notifications={regionFilter ? filteredNotifications : notifications}
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
              notifications={regionFilter ? filteredNotifications : notifications}
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
              notifications={regionFilter ? filteredNotifications : notifications}
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
