'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useLimitSync } from '@/hooks/useLimitSync';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { ArrowLeft, Filter, X, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useRegionData } from '@/hooks/useRegionData';
import { TimeFilterComponent, useTimeFilter } from '@/components/TimeFilter';
import { useFilteredNotifications } from '@/hooks/useFilteredNotifications';
import { filterNotificationsByRegionName } from '@/utils/regionMatcher';

// RegionData interface is now imported from the hook
// RegionStructure is replaced by the RegionData type from the hook

type ViewMode = 'city' | 'district';

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


// 通知類型提取函數（保留用於統計）

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
  
  // 使用統一的數據處理hook，並傳入地區篩選參數
  const { 
    finalNotifications: filteredNotifications,
    timeFilteredNotifications,
    loading, 
    error 
  } = useFilteredNotifications(currentRegionFilter);
  
  // Use the shared region data hook
  const { regionData, gridMatrix } = useRegionData();
  const [viewMode, setViewMode] = useState<ViewMode>('city');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const { limitSetting, updateLimit } = useLimitSync();
  
  const router = useRouter();
  
  // 建構首頁的 URL，保留時間篩選和數量參數
  const homeUrl = useMemo(() => {
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
    if (limitSetting !== 1000) {
      params.set('limit', limitSetting.toString());
    }
    
    return params.toString() ? `/?${params.toString()}` : '/';
  }, [timeFilter, startDate, endDate, limitSetting]);

  // 緩存基本統計數據
  const basicStats = useMemo(() => {
    const typeDistribution: { [type: string]: number } = {};
    let criticalCount = 0;

    filteredNotifications.forEach(notification => {
      const notificationType = extractNotificationType(notification.title);
      typeDistribution[notificationType] = (typeDistribution[notificationType] || 0) + 1;
      if (notification.critical) {
        criticalCount++;
      }
    });

    return { typeDistribution, criticalCount };
  }, [filteredNotifications]);

  // 緩存縣市統計數據
  const cityStats = useMemo(() => {
    if (!regionData || !gridMatrix || currentRegionFilter) {
      return new Map();
    }

    const cityStatsMap = new Map<string, { count: number; types: { [type: string]: number }; criticalCount: number; districts: string[] }>();
    
    // 初始化所有縣市
    Object.keys(regionData).forEach(city => {
      cityStatsMap.set(city, {
        count: 0,
        types: {},
        criticalCount: 0,
        districts: Object.keys(regionData[city] || {})
      });
    });
    
    // 添加全國廣播選項
    cityStatsMap.set('全部(不指定地區的全部用戶廣播通知)', {
      count: 0,
      types: {},
      criticalCount: 0,
      districts: []
    });
    
    // 優化：為每個縣市和全國廣播計算通知數量
    const regionsToProcess = [...Object.keys(regionData), '全部(不指定地區的全部用戶廣播通知)'];
    
    regionsToProcess.forEach(region => {
      // 獲取該地區的通知
      const regionNotifications = filterNotificationsByRegionName(
        timeFilteredNotifications, 
        region, 
        regionData, 
        gridMatrix
      );
      
      const regionTypeDistribution: { [type: string]: number } = {};
      let regionCriticalCount = 0;
      
      regionNotifications.forEach(notification => {
        const notificationType = extractNotificationType(notification.title);
        regionTypeDistribution[notificationType] = (regionTypeDistribution[notificationType] || 0) + 1;
        if (notification.critical) {
          regionCriticalCount++;
        }
      });
      
      cityStatsMap.set(region, {
        count: regionNotifications.length,
        types: regionTypeDistribution,
        criticalCount: regionCriticalCount,
        districts: region === '全部(不指定地區的全部用戶廣播通知)' ? [] : Object.keys(regionData[region] || {})
      });
    });

    return cityStatsMap;
  }, [regionData, gridMatrix, timeFilteredNotifications, currentRegionFilter]);

  const analyticsData = useMemo((): AnalyticsData => {
    if (!regionData || !gridMatrix) {
      return {
        regionStats: [],
        totalNotifications: 0,
        criticalNotifications: 0,
        typeDistribution: {}
      };
    }

    let regionStats: AnalyticsData['regionStats'];
    
    if (!currentRegionFilter) {
      // 沒有地區篩選時，使用緩存的縣市統計
      if (viewMode === 'city') {
        // 轉換為數組並排序
        regionStats = Array.from(cityStats.entries())
          .map(([city, stats]) => {
            // 查找該縣市的地區代碼，如果找不到則使用0
            let cityCode = 0;
            if (city !== '全部(不指定地區的全部用戶廣播通知)' && regionData[city]) {
              // 使用該縣市第一個鄉鎮區的代碼作為縣市代碼的參考
              const firstDistrict = Object.keys(regionData[city])[0];
              if (firstDistrict && regionData[city][firstDistrict]) {
                cityCode = Math.floor(regionData[city][firstDistrict].code / 1000) * 1000;
              }
            }
            
            return {
              code: cityCode,
              name: city,
              count: stats.count,
              types: stats.types,
              criticalCount: stats.criticalCount,
              districts: stats.districts
            };
          })
          .sort((a, b) => b.count - a.count);
      } else {
        regionStats = [];
      }
    } else {
      // 有地區篩選時，使用已篩選的通知進行統計
      if (viewMode === 'district' && currentRegionFilter) {
        // 根據篩選的地區，顯示該地區的詳細統計
        const isCountyLevel = Object.keys(regionData).includes(currentRegionFilter);
        
        if (isCountyLevel) {
          // 縣市級別篩選：統計該縣市下各鄉鎮區的通知數量
          const districtStats = new Map<string, { count: number; types: { [type: string]: number }; criticalCount: number }>();
          
          // 初始化該縣市下的所有鄉鎮區
          Object.keys(regionData[currentRegionFilter] || {}).forEach(district => {
            const fullDistrictName = `${currentRegionFilter}${district}`;
            districtStats.set(fullDistrictName, {
              count: 0,
              types: {},
              criticalCount: 0
            });
          });
          
          // 為每個鄉鎮區計算通知數量
          Object.keys(regionData[currentRegionFilter] || {}).forEach(district => {
            const fullDistrictName = `${currentRegionFilter}${district}`;
            const districtNotifications = filterNotificationsByRegionName(
              timeFilteredNotifications,
              fullDistrictName,
              regionData,
              gridMatrix
            );
            
            const districtTypeDistribution: { [type: string]: number } = {};
            let districtCriticalCount = 0;
            
            districtNotifications.forEach(notification => {
              const notificationType = extractNotificationType(notification.title);
              districtTypeDistribution[notificationType] = (districtTypeDistribution[notificationType] || 0) + 1;
              if (notification.critical) {
                districtCriticalCount++;
              }
            });
            
            districtStats.set(fullDistrictName, {
              count: districtNotifications.length,
              types: districtTypeDistribution,
              criticalCount: districtCriticalCount
            });
          });
          
          // 轉換為數組並排序
          regionStats = Array.from(districtStats.entries())
            .map(([districtName, stats]) => {
              // 查找該鄉鎮區的實際地區代碼
              let districtCode = 0;
              const cityName = currentRegionFilter;
              const districtOnly = districtName.replace(cityName, '');
              
              if (regionData[cityName] && regionData[cityName][districtOnly]) {
                districtCode = regionData[cityName][districtOnly].code;
              }
              
              return {
                code: districtCode,
                name: districtName,
                count: stats.count,
                types: stats.types,
                criticalCount: stats.criticalCount
              };
            })
            .sort((a, b) => b.count - a.count);
        } else {
          // 鄉鎮區級別篩選：顯示該鄉鎮區的統計
          let singleRegionCode = 0;
          
          // 嘗試找到該地區的實際代碼
          for (const [cityName, cityData] of Object.entries(regionData)) {
            for (const [districtName, districtData] of Object.entries(cityData)) {
              const fullName = `${cityName}${districtName}`;
              if (fullName === currentRegionFilter) {
                singleRegionCode = districtData.code;
                break;
              }
            }
            if (singleRegionCode !== 0) break;
          }
          
          regionStats = [{
            code: singleRegionCode,
            name: currentRegionFilter,
            count: filteredNotifications.length,
            types: basicStats.typeDistribution,
            criticalCount: basicStats.criticalCount
          }];
        }
      } else {
        regionStats = [];
      }
    }
    
    return {
      regionStats,
      totalNotifications: filteredNotifications.length,
      criticalNotifications: basicStats.criticalCount,
      typeDistribution: basicStats.typeDistribution
    };
  }, [regionData, gridMatrix, filteredNotifications, viewMode, currentRegionFilter, cityStats, basicStats, timeFilteredNotifications]);

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
      <div className="container mx-auto p-6">
        <div className="text-center py-12 text-red-500">載入通知資料失敗: {error}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center py-12 text-red-500">載入資料失敗: {error}</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Link href={homeUrl}>
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
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <Button
              variant={viewMode === 'city' ? 'default' : 'ghost'}
              size="sm"
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
              onClick={() => setViewMode('district')}
              disabled={!selectedCity}
            >
              {selectedCity === '全部(不指定地區的全部用戶廣播通知)' ? '全國廣播' : '鄉鎮區'}
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
          
          <div className="flex gap-1 bg-muted rounded-lg p-1">
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
                       // 縣市模式：切換到鄉鎮區模式，並應用地區篩選
                       setSelectedCity(region.name);
                       setSelectedDistrict(null);
                       setCurrentRegionFilter(region.name);
                       setViewMode('district');
                     } else {
                       // 鄉鎮區模式：選中該鄉鎮區顯示詳細資訊
                       if (selectedDistrict === region.name) {
                         // 已選中，跳轉到首頁
                         const params = new URLSearchParams();
                         params.set('region', encodeURIComponent(region.name));
                         
                         if (timeFilter !== 'all') {
                           params.set('timeFilter', timeFilter);
                           if (timeFilter === 'timeSlot' && startDate && endDate) {
                             params.set('startDate', startDate);
                             params.set('endDate', endDate);
                           }
                         }
                         if (limitSetting !== 1000) {
                           params.set('limit', limitSetting.toString());
                         }
                         
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
                          
                          if (timeFilter !== 'all') {
                            params.set('timeFilter', timeFilter);
                            if (timeFilter === 'timeSlot' && startDate && endDate) {
                              params.set('startDate', startDate);
                              params.set('endDate', endDate);
                            }
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
                
                if (timeFilter !== 'all') {
                  params.set('timeFilter', timeFilter);
                  if (timeFilter === 'timeSlot' && startDate && endDate) {
                    params.set('startDate', startDate);
                    params.set('endDate', endDate);
                  }
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