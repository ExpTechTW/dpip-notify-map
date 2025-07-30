'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NotificationRecord } from '@/types/notify';
import Link from 'next/link';
import { ArrowLeft, Filter, X, ChevronRight } from 'lucide-react';

interface RegionData {
  code: number;
  lat: number;
  lon: number;
  site: number;
  area: string;
}

interface RegionStructure {
  [city: string]: {
    [district: string]: RegionData;
  };
}

type TimeFilter = 'recent24h' | 'timeSlot';
type ViewMode = 'city' | 'district';

interface NotifyHistoryResponse {
  success: boolean;
  count: number;
  records: NotificationRecord[];
}

interface AnalyticsData {
  regionStats: ({
    code: number;
    name: string;
    count: number;
    types: { [type: string]: number };
    criticalCount: number;
    districts?: string[];
  })[];
  totalNotifications: number;
  criticalNotifications: number;
  typeDistribution: { [type: string]: number };
}

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

function extractNotificationType(title: string): string {
  if (title.includes('淹水感測')) return '📐 防災資訊(淹水感測)';
  if (title.includes('短時強降雨紀錄')) return '🌧️ 防災資訊(短時強降雨紀錄)';
  if (title.includes('天氣特報')) return '📊 天氣特報';
  if (title.includes('雷雨即時訊息')) return '⛈️ 雷雨即時訊息';
  if (title.includes('河川水位-警戒')) return '🚨 防災資訊(河川水位-警戒)';
  if (title.includes('道路封閉')) return '🚙 防災資訊(道路封閉)';
  if (title.includes('土石流紅色警戒')) return '🚨 防災資訊(土石流紅色警戒)';
  if (title.includes('土石流黃色警戒')) return '⚠️ 防災資訊(土石流黃色警戒)';
  if (title.includes('短時極端降雨紀錄')) return '🌧️ 防災資訊(短時極端降雨紀錄)';
  if (title.includes('河川水位-注意')) return '⚠️ 防災資訊(河川水位-注意)';
  if (title.includes('停班停課')) return '🏫 防災資訊(停班停課)';
  return '其他';
}

export default function AnalyticsPage() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('recent24h');
  const [regionData, setRegionData] = useState<RegionStructure | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('city');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  
  const router = useRouter();
  
  // 獲取通知數據
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('https://api.exptech.dev/api/v2/notify/history?limit=1000');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data: NotifyHistoryResponse = await response.json();
        
        if (!data.success) {
          throw new Error('API returned success: false');
        }
        
        const sortedRecords = data.records.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        
        setNotifications(sortedRecords);
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, []);
  
  // 獲取地區數據
  useEffect(() => {
    fetch('/region.json')
      .then(res => res.json())
      .then(data => setRegionData(data))
      .catch(err => console.error('Failed to load region data:', err));
  }, []);

  const filteredNotifications = useMemo(() => {
    if (!notifications.length) return [];
    
    let filtered = notifications;
    
    // 時間篩選
    if (timeFilter === 'recent24h') {
      const now = Date.now();
      const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
      filtered = filtered.filter(n => n.timestamp >= twentyFourHoursAgo);
    }
    
    return filtered;
  }, [notifications, timeFilter]);

  const analyticsData = useMemo((): AnalyticsData => {
    if (!regionData || !filteredNotifications.length) {
      return {
        regionStats: [],
        totalNotifications: 0,
        criticalNotifications: 0,
        typeDistribution: {}
      };
    }

    const regionMap = new Map<number, { name: string; count: number; types: { [type: string]: number }; criticalCount: number }>();
    const typeDistribution: { [type: string]: number } = {};
    let criticalCount = 0;

    // 建立地區代碼對應表
    Object.entries(regionData).forEach(([city, districts]) => {
      Object.entries(districts).forEach(([district, data]) => {
        regionMap.set(data.code, {
          name: `${city}${district}`,
          count: 0,
          types: {},
          criticalCount: 0
        });
      });
    });

    // 用於追蹤未匹配到地區的通知
    const unmatchedNotifications = new Map<string, { count: number; types: { [type: string]: number }; criticalCount: number }>();

    filteredNotifications.forEach(notification => {
      if (notification.critical) {
        criticalCount++;
      }

      // 統計通知類型
      const type = extractNotificationType(notification.title);
      
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
      
      let hasRegionMatch = false;

      // 處理直接指定的地區代碼
      notification.codes.forEach(code => {
        const region = regionMap.get(code);
        if (region) {
          region.count++;
          region.types[type] = (region.types[type] || 0) + 1;
          hasRegionMatch = true;
          if (notification.critical) {
            region.criticalCount++;
          }
        }
      });

      // 處理 Polygon 類型
      notification.Polygons.forEach(polygon => {
        const coordinates = 'coordinates' in polygon ? polygon.coordinates : polygon.geometry.coordinates;
        
        // 檢查每個地區是否在多邊形內
        Object.entries(regionData).forEach(([, districts]) => {
          Object.entries(districts).forEach(([, data]) => {
            if (isPointInPolygon([data.lon, data.lat], coordinates)) {
              const region = regionMap.get(data.code);
              if (region) {
                region.count++;
                region.types[type] = (region.types[type] || 0) + 1;
                hasRegionMatch = true;
                if (notification.critical) {
                  region.criticalCount++;
                }
              }
            }
          });
        });
      });
      
      // 處理未匹配到任何地區的通知
      if (!hasRegionMatch) {
        // 嘗試從標題中提取縣市資訊，作為備用分類
        let cityKey = '其他地區';
        
        // 檢查標題中是否包含縣市名稱
        Object.keys(regionData).forEach(city => {
          if (notification.title.includes(city)) {
            cityKey = city;
          }
        });
        
        if (!unmatchedNotifications.has(cityKey)) {
          unmatchedNotifications.set(cityKey, { count: 0, types: {}, criticalCount: 0 });
        }
        
        const unmatched = unmatchedNotifications.get(cityKey)!;
        unmatched.count++;
        unmatched.types[type] = (unmatched.types[type] || 0) + 1;
        if (notification.critical) {
          unmatched.criticalCount++;
        }
      }
    });

    let regionStats;
    
    if (viewMode === 'city') {
      // 按縣市分組統計
      const cityMap = new Map<string, { count: number; types: { [type: string]: number }; criticalCount: number; districts: string[] }>();
      
      Array.from(regionMap.entries()).forEach(([, stats]) => {
        // 提取縣市名稱
        let cityKey = '';
        for (const [city] of Object.entries(regionData)) {
          if (stats.name.startsWith(city)) {
            cityKey = city;
            break;
          }
        }
        
        if (!cityKey) return;
        
        if (!cityMap.has(cityKey)) {
          cityMap.set(cityKey, { count: 0, types: {}, criticalCount: 0, districts: [] });
        }
        
        const cityStats = cityMap.get(cityKey)!;
        cityStats.count += stats.count;
        cityStats.criticalCount += stats.criticalCount;
        cityStats.districts.push(stats.name);
        
        Object.entries(stats.types).forEach(([type, count]) => {
          cityStats.types[type] = (cityStats.types[type] || 0) + count;
        });
      });
      
      // 加入未匹配的通知到對應的縣市
      Array.from(unmatchedNotifications.entries()).forEach(([cityKey, unmatchedStats]) => {
        if (!cityMap.has(cityKey)) {
          cityMap.set(cityKey, { count: 0, types: {}, criticalCount: 0, districts: [] });
        }
        
        const cityStats = cityMap.get(cityKey)!;
        cityStats.count += unmatchedStats.count;
        cityStats.criticalCount += unmatchedStats.criticalCount;
        
        Object.entries(unmatchedStats.types).forEach(([type, count]) => {
          cityStats.types[type] = (cityStats.types[type] || 0) + count;
        });
      });
      
      regionStats = Array.from(cityMap.entries())
        .map(([city, stats]) => ({
          code: 0,
          name: city,
          count: stats.count,
          types: stats.types,
          criticalCount: stats.criticalCount,
          districts: stats.districts
        }))
        .filter(region => region.count > 0)
        .sort((a, b) => b.count - a.count);
    } else {
      // 顯示選定縣市的鄉鎮區
      regionStats = Array.from(regionMap.entries())
        .map(([code, stats]) => ({
          code,
          name: stats.name,
          count: stats.count,
          types: stats.types,
          criticalCount: stats.criticalCount
        }))
        .filter(region => {
          if (!selectedCity) return region.count > 0;
          return region.name.startsWith(selectedCity) && region.count > 0;
        })
        .sort((a, b) => b.count - a.count);
    }

    return {
      regionStats,
      totalNotifications: filteredNotifications.length,
      criticalNotifications: criticalCount,
      typeDistribution
    };
  }, [regionData, filteredNotifications, viewMode, selectedCity]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12">載入分析資料中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 text-red-500">載入失敗: {error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              返回首頁
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">通知統計分析</h1>
            {viewMode === 'district' && selectedCity && (
              <div className="flex items-center gap-2 mt-1">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">查看: {selectedCity}</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => {
                    setSelectedCity(null);
                    setViewMode('city');
                  }}
                  className="h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'city' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setViewMode('city');
                setSelectedCity(null);
              }}
            >
              縣市
            </Button>
            <Button
              variant={viewMode === 'district' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('district')}
              disabled={!selectedCity}
            >
              鄉鎮區
            </Button>
          </div>
          
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <Button
              variant={timeFilter === 'recent24h' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTimeFilter('recent24h')}
            >
              近 24 小時
            </Button>
            <Button
              variant={timeFilter === 'timeSlot' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTimeFilter('timeSlot')}
            >
              全部時段
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">總通知數量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.totalNotifications}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">緊急通知</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {analyticsData.criticalNotifications}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">影響鄉鎮</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {viewMode === 'city' 
                ? analyticsData.regionStats.reduce((total, region) => total + (region.districts?.length || 0), 0)
                : analyticsData.regionStats.length
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">緊急比例</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analyticsData.totalNotifications > 0 
                ? Math.round((analyticsData.criticalNotifications / analyticsData.totalNotifications) * 100)
                : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>通知類型分布</CardTitle>
            <CardDescription>
              {viewMode === 'city' 
                ? '全部縣市的通知類型統計' 
                : selectedCity 
                  ? `${selectedCity} 的通知類型統計`
                  : '不同類型通知的數量統計'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(
                viewMode === 'city' 
                  ? analyticsData.typeDistribution 
                  : analyticsData.regionStats.reduce((acc, region) => {
                      Object.entries(region.types).forEach(([type, count]) => {
                        acc[type] = (acc[type] || 0) + count;
                      });
                      return acc;
                    }, {} as { [type: string]: number })
              )
                .filter(([, count]) => count > 0)
                .sort(([,a], [,b]) => b - a)
                .map(([type, count]) => {
                  const totalForPercent = viewMode === 'city' 
                    ? analyticsData.totalNotifications 
                    : analyticsData.regionStats.reduce((sum, region) => sum + region.count, 0);
                  
                  return (
                    <div key={type} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{type}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {totalForPercent > 0 ? Math.round((count / totalForPercent) * 100) : 0}%
                        </span>
                      </div>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

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
              {analyticsData.regionStats.slice(0, 10).map((region, index) => (
                <div key={`${region.name}-${index}`} className="flex justify-between items-center p-2 -m-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground w-6">
                      #{index + 1}
                    </span>
                    <span className="font-medium">{region.name}</span>
                    {region.criticalCount > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        緊急 {region.criticalCount}
                      </Badge>
                    )}
                  </div>
                  <span className="font-bold">{region.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {viewMode === 'city' ? '縣市' : selectedCity ? `${selectedCity} 鄉鎮區` : '鄉鎮區'} 詳細統計
          </CardTitle>
          <CardDescription>
            {viewMode === 'city' 
              ? '各縣市的詳細通知統計（點擊查看轄區詳情）' 
              : '各鄉鎮區的詳細通知統計（點擊篩選並查看地圖）'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analyticsData.regionStats.map((region, index) => (
              <div key={`${region.name}-detail-${index}`} className="border rounded-lg p-4 hover:bg-muted/30 cursor-pointer transition-colors group"
                   onClick={() => {
                     if (viewMode === 'city') {
                       // 點擊縣市 -> 切換到鄉鎮區模式
                       setSelectedCity(region.name);
                       setViewMode('district');
                     } else {
                       // 點擊鄉鎮區 -> 篩選並跳轉到首頁
                       const params = new URLSearchParams();
                       params.set('region', encodeURIComponent(region.name));
                       router.push(`/?${params.toString()}`);
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
                  <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}