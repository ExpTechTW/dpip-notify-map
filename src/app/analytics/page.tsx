'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useLimitContext } from '@/contexts/LimitContext';
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

type TimeFilter = 'recent24h' | 'timeSlot' | 'all';
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


// 計算多邊形中心點（質心）
function getPolygonCenter(coordinates: number[][][]): [number, number] {
  const ring = coordinates[0]; // 使用外環
  let centerX = 0, centerY = 0;
  
  for (const [x, y] of ring) {
    centerX += x;
    centerY += y;
  }
  
  return [centerX / ring.length, centerY / ring.length];
}

// 載入預計算的矩陣網格
async function loadGridMatrix(): Promise<Map<string, number>> {
  try {
    const response = await fetch('/grid-matrix.json');
    const gridData = await response.json();
    const gridMatrix = new Map<string, number>();
    
    // 將 JSON 物件轉換為 Map
    Object.entries(gridData).forEach(([key, value]) => {
      gridMatrix.set(key, value as number);
    });
    
    return gridMatrix;
  } catch (error) {
    console.error('載入網格矩陣失敗:', error);
    return new Map();
  }
}

// 計算兩點之間的距離（簡化的球面距離）
function calculateDistance(point1: [number, number], point2: [number, number]): number {
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;
  
  // 簡化的歐幾里得距離（對於台灣這個尺度足夠）
  const dLon = lon2 - lon1;
  const dLat = lat2 - lat1;
  return Math.sqrt(dLon * dLon + dLat * dLat);
}

// 找到最近的網格點（限制搜索範圍提升性能）
function findNearestGridPoint(
  centerPoint: [number, number], 
  gridMatrix: Map<string, number>
): number | null {
  let minDistance = Infinity;
  let nearestTownCode: number | null = null;
  const [centerLon, centerLat] = centerPoint;
  
  // 限制搜索範圍（0.5度約55公里）
  const searchRadius = 0.5;
  const gridStep = 0.05;
  
  // 只檢查中心點周圍的網格點
  for (let lon = centerLon - searchRadius; lon <= centerLon + searchRadius; lon += gridStep) {
    for (let lat = centerLat - searchRadius; lat <= centerLat + searchRadius; lat += gridStep) {
      const key = `${lon.toFixed(3)},${lat.toFixed(3)}`;
      const townCode = gridMatrix.get(key);
      
      if (townCode) {
        const distance = calculateDistance(centerPoint, [lon, lat]);
        if (distance < minDistance) {
          minDistance = distance;
          nearestTownCode = townCode;
        }
      }
    }
  }
  
  // 如果在小範圍內沒找到，再檢查更大範圍
  if (!nearestTownCode) {
    for (const [gridKey, townCode] of gridMatrix.entries()) {
      const [lonStr, latStr] = gridKey.split(',');
      const gridPoint: [number, number] = [parseFloat(lonStr), parseFloat(latStr)];
      
      const distance = calculateDistance(centerPoint, gridPoint);
      if (distance < minDistance) {
        minDistance = distance;
        nearestTownCode = townCode;
      }
    }
  }
  
  return nearestTownCode;
}

// 使用矩陣網格分配polygon到鄉鎮
function assignPolygonToTownsByGrid(
  polygonCoords: number[][][], 
  gridMatrix: Map<string, number>
): Map<number, number> {
  const townCounts = new Map<number, number>();
  
  // 取得polygon的邊界
  const bounds = getPolygonBounds(polygonCoords);
  const gridStep = 0.05; // 與生成時保持一致
  
  // 檢查polygon邊界內的網格點
  for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += gridStep) {
    for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += gridStep) {
      const key = `${lon.toFixed(3)},${lat.toFixed(3)}`;
      const townCode = gridMatrix.get(key);
      
      if (townCode && isPointInPolygon([lon, lat], polygonCoords)) {
        townCounts.set(townCode, (townCounts.get(townCode) || 0) + 1);
      }
    }
  }
  
  return townCounts;
}

// 取得多邊形邊界
function getPolygonBounds(coordinates: number[][][]) {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  
  for (const ring of coordinates) {
    for (const [lon, lat] of ring) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
  }
  
  return { minLon, maxLon, minLat, maxLat };
}

// 點在多邊形內的檢測 (保留用於後備)
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
  if (title.includes('小區域有感地震')) return '🔔 地震報告 [小區域有感地震]';
  if (title.includes('強震監視器')) return '📡 強震監視器';
  if (title.includes('震度速報')) return '📨 震度速報';
  return '其他';
}

export default function AnalyticsPage() {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('recent24h');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [regionData, setRegionData] = useState<RegionStructure | null>(null);
  const [gridMatrix, setGridMatrix] = useState<Map<string, number> | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('city');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const { limitSetting, setLimitSetting } = useLimitContext();
  
  const router = useRouter();
  
  // 更新URL參數的函數
  const updateURL = (updates: { timeFilter?: string | null; limit?: string | null; startDate?: string; endDate?: string }) => {
    const params = new URLSearchParams(window.location.search);
    
    if (updates.timeFilter === null) {
      params.delete('timeFilter');
      params.delete('startDate');
      params.delete('endDate');
    } else if (updates.timeFilter) {
      params.set('timeFilter', updates.timeFilter);
      if (updates.timeFilter === 'timeSlot' && startDate && endDate) {
        params.set('startDate', startDate);
        params.set('endDate', endDate);
      }
    }
    
    if (updates.limit === null) {
      params.delete('limit');
    } else if (updates.limit) {
      params.set('limit', updates.limit);
    }
    
    router.push(`/analytics?${params.toString()}`, { scroll: false });
  };
  
  // 從 URL 參數讀取篩選條件
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const limitParam = urlParams.get('limit');
      const timeFilterParam = urlParams.get('timeFilter');
      const startDateParam = urlParams.get('startDate');
      const endDateParam = urlParams.get('endDate');
      
      if (limitParam) {
        const limitValue = limitParam === 'all' ? 'all' : parseInt(limitParam, 10);
        if (limitValue !== limitSetting) {
          setLimitSetting(limitValue);
        }
      }
      
      if (timeFilterParam === 'timeSlot') {
        setTimeFilter('timeSlot');
        if (startDateParam) setStartDate(startDateParam);
        if (endDateParam) setEndDate(endDateParam);
      } else if (timeFilterParam === 'all') {
        setTimeFilter('all');
      }
    }
  }, [limitSetting, setLimitSetting]);
  
  // 獲取通知數據
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`https://api.exptech.dev/api/v2/notify/history?limit=${limitSetting}`);
        
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
  }, [limitSetting]);
  
  // 獲取地區數據
  useEffect(() => {
    Promise.all([
      fetch('/region.json').then(res => res.json()),
      loadGridMatrix()
    ])
      .then(([regionData, gridMatrix]) => {
        setRegionData(regionData);
        setGridMatrix(gridMatrix);
      })
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
    } else if (timeFilter === 'timeSlot' && startDate && endDate) {
      const startTime = new Date(startDate).getTime();
      const endTime = new Date(endDate + 'T23:59:59').getTime(); // 包含結束日期的整天
      filtered = filtered.filter(n => n.timestamp >= startTime && n.timestamp <= endTime);
    }
    
    return filtered;
  }, [notifications, timeFilter, startDate, endDate]);

  const analyticsData = useMemo((): AnalyticsData => {
    if (!regionData || !gridMatrix || !filteredNotifications.length) {
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

      // 處理 Polygon 類型 - 使用網格矩陣系統
      notification.Polygons.forEach((notificationPolygon) => {
        const notificationCoordinates = 'coordinates' in notificationPolygon 
          ? notificationPolygon.coordinates 
          : notificationPolygon.geometry.coordinates;
        
        // 使用網格矩陣分配polygon到鄉鎮
        const townCounts = assignPolygonToTownsByGrid(notificationCoordinates, gridMatrix);
        
        let bestTownCode: number | null = null;
        
        if (townCounts.size > 0) {
          // 找出包含最多網格點的鄉鎮
          let maxCount = 0;
          
          for (const [townCode, count] of townCounts.entries()) {
            if (count > maxCount) {
              maxCount = count;
              bestTownCode = townCode;
            }
          }
        } else {
          // 備用方案：找最近的網格點
          const polygonCenter = getPolygonCenter(notificationCoordinates);
          bestTownCode = findNearestGridPoint(polygonCenter, gridMatrix);
        }
        
        // 分配給選定的鄉鎮
        if (bestTownCode) {
          const region = regionMap.get(bestTownCode);
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
      
      // 處理未匹配到任何地區的通知
      if (!hasRegionMatch) {
        let cityKey = '其他地區';
        
        // 檢查是否為全部用戶廣播（無codes和polygons，或codes不是{topic}-{region code}格式）
        if (notification.codes.length === 0 && notification.Polygons.length === 0) {
          cityKey = '全部(不指定地區的全部用戶廣播通知)';
        } else if (notification.codes.length > 0) {
          // 檢查codes是否都不是{topic}-{region code}格式（即不包含數字）
          const hasRegionCode = notification.codes.some(code => /\d+/.test(String(code)));
          if (!hasRegionCode) {
            cityKey = '全部(不指定地區的全部用戶廣播通知)';
          } else {
            // 嘗試從標題提取縣市
            for (const city of Object.keys(regionData)) {
              if (notification.title.includes(city)) {
                cityKey = city;
                break;
              }
            }
          }
        } else if (notification.Polygons.length > 0) {
          cityKey = '未知區域廣播';
        }
        
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
      console.log('鄉鎮區模式 - 選定的縣市:', selectedCity);
      console.log('regionMap 內容:', Array.from(regionMap.entries()).slice(0, 5));
      console.log('unmatchedNotifications 內容:', Array.from(unmatchedNotifications.entries()));
      
      const districtStats = Array.from(regionMap.entries())
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
        });
      
      // 特殊分類處理
      if (selectedCity && unmatchedNotifications.has(selectedCity)) {
        const unmatchedStats = unmatchedNotifications.get(selectedCity)!;
        console.log(`特殊分類 "${selectedCity}" 的統計:`, unmatchedStats);
        
        // 全國廣播等特殊分類不顯示詳細統計，僅用於類型分布計算
        if (selectedCity !== '全部(不指定地區的全部用戶廣播通知)') {
          districtStats.push({
            code: 0,
            name: selectedCity,
            count: unmatchedStats.count,
            types: unmatchedStats.types,
            criticalCount: unmatchedStats.criticalCount
          });
        }
      }
      
      regionStats = districtStats.sort((a, b) => b.count - a.count);
      
      console.log('最終鄉鎮區統計結果:', regionStats);
    }

    // 計算當前選中地區的統計
    let currentTotalNotifications = filteredNotifications.length;
    let currentCriticalNotifications = criticalCount;
    let currentTypeDistribution = typeDistribution;
    
    if (viewMode === 'district' && selectedCity) {
      console.log('計算鄉鎮區統計，選中城市:', selectedCity);
      console.log('unmatchedNotifications:', Array.from(unmatchedNotifications.entries()));
      
      // 如果是特殊分類，使用特殊分類的統計
      if (unmatchedNotifications.has(selectedCity)) {
        const specialStats = unmatchedNotifications.get(selectedCity)!;
        console.log('使用特殊分類統計:', specialStats);
        currentTotalNotifications = specialStats.count;
        currentCriticalNotifications = specialStats.criticalCount;
        currentTypeDistribution = specialStats.types;
      } else {
        // 一般縣市：計算該縣市的統計
        const cityNotifications = regionStats.filter(region => 
          region.name.startsWith(selectedCity)
        );
        console.log('一般縣市通知:', cityNotifications);
        currentTotalNotifications = cityNotifications.reduce((sum, region) => sum + region.count, 0);
        currentCriticalNotifications = cityNotifications.reduce((sum, region) => sum + region.criticalCount, 0);
        currentTypeDistribution = cityNotifications.reduce((acc, region) => {
          Object.entries(region.types).forEach(([type, count]) => {
            acc[type] = (acc[type] || 0) + count;
          });
          return acc;
        }, {} as { [type: string]: number });
      }
      
      console.log('最終類型分布:', currentTypeDistribution);
      console.log('全部類型分布 (typeDistribution):', typeDistribution);
    }

    console.log('返回的analytics數據:', {
      regionStats: regionStats.slice(0, 3),
      totalNotifications: currentTotalNotifications,
      criticalNotifications: currentCriticalNotifications,
      typeDistribution: currentTypeDistribution,
      viewMode,
      selectedCity
    });

    return {
      regionStats,
      totalNotifications: currentTotalNotifications,
      criticalNotifications: currentCriticalNotifications,
      typeDistribution: currentTypeDistribution
    };
  }, [regionData, gridMatrix, filteredNotifications, viewMode, selectedCity]);

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
                    setSelectedDistrict(null);
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
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'city' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setViewMode('city');
                setSelectedCity(null);
                setSelectedDistrict(null);
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
              {selectedCity === '全部(不指定地區的全部用戶廣播通知)' ? '全國廣播' : '鄉鎮區'}
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              <Button
                variant={timeFilter === 'recent24h' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setTimeFilter('recent24h');
                  updateURL({ timeFilter: null });
                }}
              >
                近 24 小時
              </Button>
              <Button
                variant={timeFilter === 'timeSlot' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTimeFilter('timeSlot')}
              >
                指定區間
              </Button>
              <Button
                variant={timeFilter === 'all' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setTimeFilter('all');
                  updateURL({ timeFilter: 'all' });
                }}
              >
                全部區間
              </Button>
            </div>
            
            {timeFilter === 'timeSlot' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs border rounded px-2 py-1 bg-background"
                />
                <span className="text-xs text-muted-foreground">至</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs border rounded px-2 py-1 bg-background"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (startDate && endDate) {
                      updateURL({ timeFilter: 'timeSlot' });
                    }
                  }}
                  disabled={!startDate || !endDate}
                >
                  套用
                </Button>
              </div>
            )}
          </div>
          
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <Button
              variant={limitSetting === 100 ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setLimitSetting(100);
                updateURL({ limit: '100' });
              }}
            >
              100
            </Button>
            <Button
              variant={limitSetting === 500 ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setLimitSetting(500);
                updateURL({ limit: '500' });
              }}
            >
              500
            </Button>
            <Button
              variant={limitSetting === 1000 ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setLimitSetting(1000);
                updateURL({ limit: '1000' });
              }}
            >
              1000
            </Button>
            <Button
              variant={limitSetting === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setLimitSetting('all');
                updateURL({ limit: 'all' });
              }}
            >
              全部
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" key={`stats-${viewMode}-${selectedCity}`}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">總通知數量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData.totalNotifications}</div>
            {viewMode === 'district' && selectedCity && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedCity === '全部(不指定地區的全部用戶廣播通知)' ? '全國廣播' : selectedCity}
              </p>
            )}
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
            {viewMode === 'district' && selectedCity && (
              <p className="text-xs text-muted-foreground mt-1">
                {selectedCity === '全部(不指定地區的全部用戶廣播通知)' ? '全國廣播' : selectedCity}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card key={`type-distribution-${viewMode}-${selectedCity}`}>
          <CardHeader>
            <CardTitle>通知類型分布</CardTitle>
            <CardDescription>
              {viewMode === 'city' 
                ? '全部縣市的通知類型統計' 
                : selectedCity 
                  ? `${selectedCity === '全部(不指定地區的全部用戶廣播通知)' ? '全國廣播' : selectedCity} 的通知類型統計`
                  : '不同類型通知的數量統計'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(() => {
                const distributionToShow = viewMode === 'city' 
                  ? analyticsData.typeDistribution 
                  : selectedCity === '全部(不指定地區的全部用戶廣播通知)'
                    ? analyticsData.typeDistribution  // 直接使用全國廣播的類型分布
                    : analyticsData.regionStats.reduce((acc, region) => {
                        Object.entries(region.types).forEach(([type, count]) => {
                          acc[type] = (acc[type] || 0) + count;
                        });
                        return acc;
                      }, {} as { [type: string]: number });
                
                console.log('要顯示的類型分布:', distributionToShow);
                console.log('viewMode:', viewMode, 'selectedCity:', selectedCity);
                console.log('analyticsData.totalNotifications:', analyticsData.totalNotifications);
                console.log('analyticsData.typeDistribution:', analyticsData.typeDistribution);
                
                return Object.entries(distributionToShow);
              })()
                .filter(([, count]) => count > 0)
                .sort(([,a], [,b]) => b - a)
                .map(([type, count]) => {
                  const totalForPercent = viewMode === 'city' 
                    ? analyticsData.totalNotifications 
                    : analyticsData.totalNotifications; // 使用當前選中地區的總數
                  
                  const percentage = totalForPercent > 0 ? Math.round((count / totalForPercent) * 100) : 0;
                  
                  if (percentage === 0 && count > 0) {
                    console.warn(`類型分布顯示異常: "${type}": count=${count}, totalForPercent=${totalForPercent}, percentage=${percentage}%`);
                  }
                  
                  return (
                    <div key={type} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{type}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {percentage}%
                        </span>
                      </div>
                      <span className="font-medium">{count}</span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>

        {!(viewMode === 'district' && selectedCity === '全部(不指定地區的全部用戶廣播通知)') && (
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
        )}
      </div>

      {!(viewMode === 'district' && selectedCity === '全部(不指定地區的全部用戶廣播通知)') && (
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
                   className={`border rounded-lg p-4 cursor-pointer transition-colors group ${
                     isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                   }`}
                   onClick={() => {
                     if (viewMode === 'city') {
                       // 縣市模式：切換到鄉鎮區模式
                       setSelectedCity(region.name);
                       setSelectedDistrict(null);
                       setViewMode('district');
                     } else {
                       // 鄉鎮區模式：選中該鄉鎮區顯示詳細資訊
                       if (selectedDistrict === region.name) {
                         // 已選中，跳轉到首頁
                         const params = new URLSearchParams();
                         params.set('region', encodeURIComponent(region.name));
                         
                         if (timeFilter === 'timeSlot') {
                           params.set('timeFilter', 'timeSlot');
                         }
                         if (limitSetting !== 1000) {
                           params.set('limit', limitSetting.toString());
                         }
                         
                         console.log('跳轉到首頁，參數:', params.toString());
                         router.push(`/?${params.toString()}`);
                       } else {
                         // 未選中，選中該鄉鎮區
                         setSelectedDistrict(region.name);
                       }
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
                    {isSelected && viewMode === 'district' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          const params = new URLSearchParams();
                          params.set('region', encodeURIComponent(region.name));
                          
                          if (timeFilter === 'timeSlot') {
                            params.set('timeFilter', 'timeSlot');
                          }
                          if (limitSetting !== 1000) {
                            params.set('limit', limitSetting.toString());
                          }
                          
                          router.push(`/?${params.toString()}`);
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
                {isSelected && viewMode === 'district' && (
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
                    <div className="space-y-2">
                      {Object.entries(region.types)
                        .filter(([, count]) => count > 0)
                        .sort(([,a], [,b]) => b - a)
                        .map(([type, count]) => {
                          const percentage = Math.round((count / region.count) * 100);
                          return (
                            <div key={type} className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">{type}</Badge>
                                <span className="text-xs text-muted-foreground">{percentage}%</span>
                              </div>
                              <span className="text-sm font-medium">{count}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
              );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      
      {viewMode === 'district' && selectedCity === '全部(不指定地區的全部用戶廣播通知)' && (
        <Card>
          <CardHeader>
            <CardTitle>前往首頁查看通知</CardTitle>
            <CardDescription>點擊下方按鈕前往首頁查看全國廣播通知的詳細內容</CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => {
                const params = new URLSearchParams();
                params.set('region', encodeURIComponent('全部(不指定地區的全部用戶廣播通知)'));
                
                if (timeFilter === 'timeSlot') {
                  params.set('timeFilter', 'timeSlot');
                }
                if (limitSetting !== 1000) {
                  params.set('limit', limitSetting.toString());
                }
                
                router.push(`/?${params.toString()}`);
              }}
              className="w-full"
            >
              查看全國廣播通知
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}