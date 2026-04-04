import { NotificationRecord } from '@/types/notify';

// 快取多邊形到鄉鎮的對應關係
const polygonToTownsCache = new Map<string, Map<number, number>>();

// 預計算所有通知的地區匹配結果
const precomputedRegionMatches = new Map<number, RegionMatchResult>();

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

// 檢查點是否在多邊形內
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

// 生成多邊形的唯一標識符
function getPolygonHash(polygonCoords: number[][][]): string {
  // 使用多邊形的邊界和中心點來生成雜湊
  const bounds = getPolygonBounds(polygonCoords);
  const center = getPolygonCenter(polygonCoords);
  return `${bounds.minLon.toFixed(3)},${bounds.minLat.toFixed(3)},${bounds.maxLon.toFixed(3)},${bounds.maxLat.toFixed(3)},${center[0].toFixed(3)},${center[1].toFixed(3)}`;
}

// 使用網格矩陣將多邊形分配到鄉鎮（帶快取）
function assignPolygonToTownsByGrid(
  polygonCoords: number[][][], 
  gridMatrix: Map<string, number>
): Map<number, number> {
  // 生成多邊形的唯一標識符
  const polygonHash = getPolygonHash(polygonCoords);
  
  // 檢查快取
  if (polygonToTownsCache.has(polygonHash)) {
    return polygonToTownsCache.get(polygonHash)!;
  }
  
  const townCounts = new Map<number, number>();
  
  // 取得polygon的邊界
  const bounds = getPolygonBounds(polygonCoords);
  const gridStep = 0.05; // 與生成時保持一致
  
  // 優化：減少網格點檢查的粒度以提高性能
  const optimizedGridStep = Math.max(gridStep * 2, (bounds.maxLon - bounds.minLon) / 25); // 進一步減少網格密度
  
  // 檢查polygon邊界內的網格點
  for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += optimizedGridStep) {
    for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += optimizedGridStep) {
      const key = `${lon.toFixed(3)},${lat.toFixed(3)}`;
      const townCode = gridMatrix.get(key);
      
      if (townCode && isPointInPolygon([lon, lat], polygonCoords)) {
        townCounts.set(townCode, (townCounts.get(townCode) || 0) + 1);
      }
    }
  }
  
  // 快取結果
  polygonToTownsCache.set(polygonHash, townCounts);
  
  return townCounts;
}

// 取得多邊形中心點
function getPolygonCenter(coordinates: number[][][]): [number, number] {
  let totalLon = 0;
  let totalLat = 0;
  let count = 0;
  
  for (const ring of coordinates) {
    for (const [lon, lat] of ring) {
      totalLon += lon;
      totalLat += lat;
      count++;
    }
  }
  
  return [totalLon / count, totalLat / count];
}

// 找最近的網格點
function findNearestGridPoint(
  point: [number, number], 
  gridMatrix: Map<string, number>
): number | null {
  let minDistance = Infinity;
  let nearestTownCode: number | null = null;
  
  for (const [key, townCode] of gridMatrix.entries()) {
    const [lonStr, latStr] = key.split(',');
    const lon = parseFloat(lonStr);
    const lat = parseFloat(latStr);
    
    const distance = Math.sqrt(
      Math.pow(lon - point[0], 2) + 
      Math.pow(lat - point[1], 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      nearestTownCode = townCode;
    }
  }
  
  return nearestTownCode;
}

export interface RegionMatchResult {
  matchedRegions: Set<number>; // 匹配到的地區代碼
  isNationwide: boolean; // 是否為全國廣播
  isUnknownArea: boolean; // 是否為未知區域
  isOtherArea: boolean; // 是否為其他地區
}

export function precomputeAllRegionMatches(
  notifications: NotificationRecord[],
  regionData: Record<string, Record<string, { code: number; lat: number; lon: number; site: number; area: string }>>,
  gridMatrix: Map<string, number>
): Promise<void> {
  precomputedRegionMatches.clear();
  for (const notification of notifications) {
    if (notification.Polygons.length === 0) continue;
    precomputedRegionMatches.set(
      notification.timestamp,
      computeNotificationRegions(notification, regionData, gridMatrix)
    );
  }
  return Promise.resolve();
}

// 內部計算函數（不使用快取）
function computeNotificationRegions(
  notification: NotificationRecord,
  regionData: Record<string, Record<string, { code: number; lat: number; lon: number; site: number; area: string }>>,
  gridMatrix: Map<string, number>
): RegionMatchResult {
  const result: RegionMatchResult = {
    matchedRegions: new Set<number>(),
    isNationwide: false,
    isUnknownArea: false,
    isOtherArea: false
  };

  // 1. 處理直接指定的地區代碼
  notification.codes.forEach(code => {
    // 檢查是否為有效的地區代碼
    let isValidCode = false;
    for (const [, districts] of Object.entries(regionData)) {
      for (const [, data] of Object.entries(districts)) {
        if (data.code === code) {
          isValidCode = true;
          result.matchedRegions.add(code);
          break;
        }
      }
      if (isValidCode) break;
    }
  });

  // 2. 處理 Polygon 類型 - 使用網格矩陣系統
  notification.Polygons.forEach((notificationPolygon) => {
    const notificationCoordinates = 'coordinates' in notificationPolygon 
      ? notificationPolygon.coordinates 
      : notificationPolygon.geometry.coordinates;
        
    // 使用網格矩陣分配polygon到鄉鎮
    const townCounts = assignPolygonToTownsByGrid(notificationCoordinates, gridMatrix);
        
    if (townCounts.size > 0) {
      // 找出包含最多網格點的鄉鎮
      let maxCount = 0;
      let bestTownCode: number | null = null;
      let bestTownName = '';
      
      for (const [townCode, count] of townCounts.entries()) {
        if (count > maxCount) {
          maxCount = count;
          bestTownCode = townCode;
          // 找到地區名稱
          for (const [city, districts] of Object.entries(regionData)) {
            for (const [district, data] of Object.entries(districts)) {
              if (data.code === townCode) {
                bestTownName = `${city}${district}`;
                break;
              }
            }
            if (bestTownName) break;
          }
        }
      }
      
      if (bestTownCode) {
        result.matchedRegions.add(bestTownCode);
      }
    } else {
      // 備用方案：找最近的網格點
      const polygonCenter = getPolygonCenter(notificationCoordinates);
      const nearestCode = findNearestGridPoint(polygonCenter, gridMatrix);
      if (nearestCode) {
        result.matchedRegions.add(nearestCode);
        if (false) { // debug removed
          let nearestName = '';
          for (const [city, districts] of Object.entries(regionData)) {
            for (const [district, data] of Object.entries(districts)) {
              if (data.code === nearestCode) {
                nearestName = `${city}${district}`;
                break;
              }
            }
            if (nearestName) break;
          }
        }
      }
    }
  });

  // 3. 判斷特殊類型
  if (result.matchedRegions.size === 0) {
    // 檢查是否為全國廣播
    if (notification.codes.length === 0 && notification.Polygons.length === 0) {
      result.isNationwide = true;
    }
    // 檢查是否為無數字區域代碼的通知
    else if (notification.codes.length > 0 && notification.codes.every(code => {
      // 檢查是否為無效代碼
      let isInvalid = true;
      for (const [, districts] of Object.entries(regionData)) {
        for (const [, data] of Object.entries(districts)) {
          if (data.code === code) {
            isInvalid = false;
            break;
          }
        }
        if (!isInvalid) break;
      }
      return isInvalid;
    })) {
      result.isNationwide = true;
    }
    // 有polygon但無法匹配到已知地區
    else if (notification.Polygons.length > 0) {
      result.isUnknownArea = true;
    }
    // 有代碼但不匹配任何已知地區
    else {
      result.isOtherArea = true;
    }
  } 
  
  return result;
}

export function matchNotificationToRegions(
  notification: NotificationRecord,
  regionData: Record<string, Record<string, { code: number; lat: number; lon: number; site: number; area: string }>>,
  gridMatrix: Map<string, number>
): RegionMatchResult {
  // 檢查預計算結果（只有多邊形通知才有預計算）
  if (precomputedRegionMatches.has(notification.timestamp)) {
    return precomputedRegionMatches.get(notification.timestamp)!;
  }
  
  // 快速處理簡單情況
  if (notification.codes.length === 0 && notification.Polygons.length === 0) {
    return {
      matchedRegions: new Set<number>(),
      isNationwide: true,
      isUnknownArea: false,
      isOtherArea: false
    };
  }
  
  if (notification.codes.length > 0 && notification.Polygons.length === 0) {
    // 只有代碼的簡單情況，快速處理
    const result: RegionMatchResult = {
      matchedRegions: new Set<number>(),
      isNationwide: false,
      isUnknownArea: false,
      isOtherArea: false
    };
    
    // 檢查代碼有效性
    let hasValidCode = false;
    notification.codes.forEach(code => {
      for (const [, districts] of Object.entries(regionData)) {
        for (const [, data] of Object.entries(districts)) {
          if (data.code === code) {
            result.matchedRegions.add(code);
            hasValidCode = true;
            break;
          }
        }
        if (hasValidCode) break;
      }
    });
    
    if (!hasValidCode) {
      result.isNationwide = true;
    }
    
    return result;
  }
  
  // 複雜情況（有多邊形）即時計算
  return computeNotificationRegions(notification, regionData, gridMatrix);
}

export function filterNotificationsByRegionName(
  notifications: NotificationRecord[],
  targetRegion: string,
  regionData: Record<string, Record<string, { code: number; lat: number; lon: number; site: number; area: string }>>,
  gridMatrix: Map<string, number>
): NotificationRecord[] {
  
  if (targetRegion === '全部(不指定地區的全部用戶廣播通知)') {
    const result = notifications.filter(notification => {
      const matchResult = matchNotificationToRegions(notification, regionData, gridMatrix);
      return matchResult.isNationwide;
    });
    return result;
  }

  if (targetRegion === '其他地區') {
    const result = notifications.filter(notification => {
      const matchResult = matchNotificationToRegions(notification, regionData, gridMatrix);
      return matchResult.isOtherArea;
    });
    return result;
  }

  if (targetRegion === '未知區域廣播通知') {
    const result = notifications.filter(notification => {
      const matchResult = matchNotificationToRegions(notification, regionData, gridMatrix);
      return matchResult.isUnknownArea;
    });
    return result;
  }

  const targetCodes: number[] = [];
  for (const [city, districts] of Object.entries(regionData)) {
    for (const [district, data] of Object.entries(districts)) {
      const fullName = `${city}${district}`;
      if (fullName === targetRegion || city === targetRegion) {
        targetCodes.push(data.code);
      }
    }
  }

  if (targetCodes.length === 0) {
    return [];
  }

  // 篩選符合的通知（使用預計算結果，性能極佳）
  const matchedNotifications: NotificationRecord[] = [];
  
  notifications.forEach((notification) => {
    let matched = false;
    let matchedByTitle = false;
    let matchedByCode = false;
    let matchedByPolygon = false;
    
    // 1. 檢查標題是否包含地區名稱
    if (notification.title.includes(targetRegion)) {
      matchedByTitle = true;
    }

    // 2. 使用預計算的匹配結果（如果可用）
    const matchResult = matchNotificationToRegions(notification, regionData, gridMatrix);
    
    // 檢查是否有任何目標地區代碼被匹配到
    for (const targetCode of targetCodes) {
      if (matchResult.matchedRegions.has(targetCode)) {
        if (notification.codes.includes(targetCode)) {
          matchedByCode = true;
        } else {
          matchedByPolygon = true;
        }
        break;
      }
    }
    
    // 決定是否匹配和匹配原因
    matched = matchedByTitle || matchedByCode || matchedByPolygon;

    if (matched) {
      matchedNotifications.push(notification);
    }
  });
    
  return matchedNotifications;
}