import { NotificationRecord } from '@/types/notify';

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

// 使用網格矩陣將多邊形分配到鄉鎮
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

// 從標題提取通知類型
function extractNotificationType(title: string): string {
  if (title.includes('地震')) return '地震';
  if (title.includes('海嘯')) return '海嘯';
  if (title.includes('火山')) return '火山';
  if (title.includes('颱風')) return '颱風';
  if (title.includes('豪雨') || title.includes('淹水')) return '天氣';
  if (title.includes('核子')) return '核子事故';
  if (title.includes('空襲')) return '空襲';
  if (title.includes('飛彈')) return '飛彈';
  if (title.includes('測試')) return '測試';
  if (title.includes('演習')) return '演習';
  return '其他';
}

export interface RegionMatchResult {
  matchedRegions: Set<number>; // 匹配到的地區代碼
  isNationwide: boolean; // 是否為全國廣播
  isUnknownArea: boolean; // 是否為未知區域
  isOtherArea: boolean; // 是否為其他地區
}

// 統一的地區匹配邏輯
export function matchNotificationToRegions(
  notification: NotificationRecord,
  regionData: Record<string, Record<string, { code: number; lat: number; lon: number; site: number; area: string }>>,
  gridMatrix: Map<string, number>,
  debug: boolean = false
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
        if (debug) {
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

// 根據地區名稱篩選通知
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

  // 篩選符合的通知
  const matchedNotifications: NotificationRecord[] = [];
  
  notifications.forEach((notification, index) => {
    let matched = false;
    let matchedByTitle = false;
    let matchedByCode = false;
    let matchedByPolygon = false;
    
    // 1. 檢查標題是否包含地區名稱
    if (notification.title.includes(targetRegion)) {
      matchedByTitle = true;
    }

    // 2. 使用統一的地區匹配邏輯檢查代碼和多邊形匹配
    const matchResult = matchNotificationToRegions(notification, regionData, gridMatrix, index < 3); // 只對前3個通知啟用debug
    
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

export { extractNotificationType };