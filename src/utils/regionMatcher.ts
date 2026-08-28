import { NotificationRecord } from '@/types/notify';
import type { RegionData } from '@/hooks/useRegionData';

/** 「全國廣播」在 UI / URL 中使用的地區名稱 */
export const NATIONWIDE_REGION = '全部(不指定地區的全部用戶廣播通知)';
/** 有多邊形但對不上任何已知鄉鎮的通知 */
export const UNKNOWN_AREA_REGION = '未知區域廣播通知';

export interface RegionMatchResult {
  matchedRegions: Set<number>; // 匹配到的地區代碼
  isNationwide: boolean; // 是否為全國廣播
  isUnknownArea: boolean; // 是否為未知區域
}

// ── 索引(依 regionData / gridMatrix 物件身分快取,資料只載入一次故建一次即可) ──

interface RegionIndex {
  /** 地區代碼 → 縣市名 */
  cityOf: Map<number, string>;
  /** 地區代碼 → `${縣市}${鄉鎮區}` */
  fullNameOf: Map<number, string>;
}

const regionIndexCache = new WeakMap<object, RegionIndex>();

function getRegionIndex(regionData: RegionData): RegionIndex {
  let index = regionIndexCache.get(regionData);
  if (index) return index;

  index = { cityOf: new Map(), fullNameOf: new Map() };
  for (const [city, districts] of Object.entries(regionData)) {
    for (const [district, data] of Object.entries(districts)) {
      index.cityOf.set(data.code, city);
      index.fullNameOf.set(data.code, `${city}${district}`);
    }
  }
  regionIndexCache.set(regionData, index);
  return index;
}

/** 代碼是否對應到已知鄉鎮區 */
export function isKnownRegionCode(regionData: RegionData, code: number): boolean {
  return getRegionIndex(regionData).cityOf.has(code);
}

/** 地區名稱(縣市或 `${縣市}${鄉鎮區}`)涵蓋的所有代碼 */
export function getRegionCodes(regionData: RegionData, targetRegion: string): Set<number> {
  const { cityOf, fullNameOf } = getRegionIndex(regionData);
  const codes = new Set<number>();
  for (const [code, city] of cityOf) {
    if (city === targetRegion || fullNameOf.get(code) === targetRegion) codes.add(code);
  }
  return codes;
}

/** 網格點攤平成數值陣列,省去每次比對時的字串切割與 parseFloat */
interface GridIndex {
  lon: Float64Array;
  lat: Float64Array;
  code: Int32Array;
}

const gridIndexCache = new WeakMap<Map<string, number>, GridIndex>();

function getGridIndex(gridMatrix: Map<string, number>): GridIndex {
  let index = gridIndexCache.get(gridMatrix);
  if (index) return index;

  const size = gridMatrix.size;
  index = { lon: new Float64Array(size), lat: new Float64Array(size), code: new Int32Array(size) };
  let i = 0;
  for (const [key, code] of gridMatrix) {
    const comma = key.indexOf(',');
    index.lon[i] = Number(key.slice(0, comma));
    index.lat[i] = Number(key.slice(comma + 1));
    index.code[i] = code;
    i++;
  }
  gridIndexCache.set(gridMatrix, index);
  return index;
}

// ── 多邊形 → 鄉鎮 ──

interface PolygonExtent {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
  centerLon: number;
  centerLat: number;
}

/** 一次掃描取得邊界與中心點(兩者原本各掃一遍) */
function getPolygonExtent(coordinates: number[][][]): PolygonExtent {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  let totalLon = 0, totalLat = 0, count = 0;

  for (const ring of coordinates) {
    for (const [lon, lat] of ring) {
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      totalLon += lon;
      totalLat += lat;
      count++;
    }
  }

  return { minLon, maxLon, minLat, maxLat, centerLon: totalLon / count, centerLat: totalLat / count };
}

// 檢查點是否在多邊形內(任一 ring 命中即算內部)
function isPointInPolygon(x: number, y: number, polygon: number[][][]): boolean {
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

// 找最近的網格點(比距離平方即可,不必開根號)
function findNearestGridCode(gridMatrix: Map<string, number>, lon: number, lat: number): number | null {
  const { lon: gLon, lat: gLat, code } = getGridIndex(gridMatrix);
  let minDistanceSq = Infinity;
  let nearest: number | null = null;

  for (let i = 0; i < code.length; i++) {
    const dx = gLon[i] - lon;
    const dy = gLat[i] - lat;
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < minDistanceSq) {
      minDistanceSq = distanceSq;
      nearest = code[i];
    }
  }

  return nearest;
}

// 每個多邊形只會得到一個鄉鎮代碼,結果依「邊界+中心點」快取(同一形狀重複出現時直接命中)
const polygonCodeCache = new WeakMap<Map<string, number>, Map<string, number | null>>();

/** 用網格矩陣把多邊形歸到單一鄉鎮:取涵蓋網格點最多者,完全沒涵蓋則退回離中心最近的網格點 */
function polygonToTownCode(coordinates: number[][][], gridMatrix: Map<string, number>): number | null {
  const e = getPolygonExtent(coordinates);
  const hash = `${e.minLon.toFixed(3)},${e.minLat.toFixed(3)},${e.maxLon.toFixed(3)},${e.maxLat.toFixed(3)},${e.centerLon.toFixed(3)},${e.centerLat.toFixed(3)}`;

  let cache = polygonCodeCache.get(gridMatrix);
  if (!cache) polygonCodeCache.set(gridMatrix, (cache = new Map()));
  const cached = cache.get(hash);
  if (cached !== undefined) return cached;

  // 掃描粒度:網格本身為 0.05,這裡放寬到 0.1 或「經度跨度 / 25」(取大者)以壓低取樣點數
  const step = Math.max(0.1, (e.maxLon - e.minLon) / 25);
  const townCounts = new Map<number, number>();

  for (let lon = e.minLon; lon <= e.maxLon; lon += step) {
    for (let lat = e.minLat; lat <= e.maxLat; lat += step) {
      const townCode = gridMatrix.get(`${lon.toFixed(3)},${lat.toFixed(3)}`);
      if (townCode && isPointInPolygon(lon, lat, coordinates)) {
        townCounts.set(townCode, (townCounts.get(townCode) ?? 0) + 1);
      }
    }
  }

  let result: number | null = null;
  if (townCounts.size > 0) {
    let maxCount = 0;
    for (const [townCode, count] of townCounts) {
      if (count > maxCount) {
        maxCount = count;
        result = townCode;
      }
    }
  } else {
    result = findNearestGridCode(gridMatrix, e.centerLon, e.centerLat);
  }

  cache.set(hash, result);
  return result;
}

// ── 通知 → 地區 ──

function polygonCoordinates(polygon: NotificationRecord['Polygons'][number]): number[][][] {
  return 'coordinates' in polygon ? polygon.coordinates : polygon.geometry.coordinates;
}

function computeNotificationRegions(
  notification: NotificationRecord,
  regionData: RegionData,
  gridMatrix: Map<string, number>
): RegionMatchResult {
  const { cityOf } = getRegionIndex(regionData);
  const matchedRegions = new Set<number>();

  for (const code of notification.codes) {
    if (cityOf.has(code)) matchedRegions.add(code);
  }

  for (const polygon of notification.Polygons) {
    const townCode = polygonToTownCode(polygonCoordinates(polygon), gridMatrix);
    if (townCode) matchedRegions.add(townCode);
  }

  // 完全沒匹配到時:代表所有代碼都無效。有代碼(全無效)或連範圍都沒指定 → 視為全國廣播;
  // 只有多邊形卻對不上任何鄉鎮 → 未知區域。
  const unmatched = matchedRegions.size === 0;
  return {
    matchedRegions,
    isNationwide: unmatched && (notification.codes.length > 0 || notification.Polygons.length === 0),
    isUnknownArea: unmatched && notification.codes.length === 0 && notification.Polygons.length > 0,
  };
}

// 預計算結果(以 timestamp 為鍵,只放有多邊形的通知)
const precomputedRegionMatches = new Map<number, RegionMatchResult>();
// 其餘通知依物件身分快取,避免同一批資料被反覆重算
const lazyMatchCache = new WeakMap<object, WeakMap<NotificationRecord, RegionMatchResult>>();

export function precomputeAllRegionMatches(
  notifications: NotificationRecord[],
  regionData: RegionData,
  gridMatrix: Map<string, number>
): void {
  precomputedRegionMatches.clear();
  for (const notification of notifications) {
    if (notification.Polygons.length === 0) continue;
    precomputedRegionMatches.set(
      notification.timestamp,
      computeNotificationRegions(notification, regionData, gridMatrix)
    );
  }
}

export function matchNotificationToRegions(
  notification: NotificationRecord,
  regionData: RegionData,
  gridMatrix: Map<string, number>
): RegionMatchResult {
  const precomputed = precomputedRegionMatches.get(notification.timestamp);
  if (precomputed) return precomputed;

  let cache = lazyMatchCache.get(regionData);
  if (!cache) lazyMatchCache.set(regionData, (cache = new WeakMap()));
  let result = cache.get(notification);
  if (!result) {
    result = computeNotificationRegions(notification, regionData, gridMatrix);
    cache.set(notification, result);
  }
  return result;
}

function matchesRegionName(
  notification: NotificationRecord,
  targetRegion: string,
  targetCodes: Set<number>,
  regionData: RegionData,
  gridMatrix: Map<string, number>
): boolean {
  if (notification.title.includes(targetRegion)) return true;
  for (const code of matchNotificationToRegions(notification, regionData, gridMatrix).matchedRegions) {
    if (targetCodes.has(code)) return true;
  }
  return false;
}

export function filterNotificationsByRegionName(
  notifications: NotificationRecord[],
  targetRegion: string,
  regionData: RegionData,
  gridMatrix: Map<string, number>
): NotificationRecord[] {
  if (targetRegion === NATIONWIDE_REGION) {
    return notifications.filter(n => matchNotificationToRegions(n, regionData, gridMatrix).isNationwide);
  }

  if (targetRegion === UNKNOWN_AREA_REGION) {
    return notifications.filter(n => matchNotificationToRegions(n, regionData, gridMatrix).isUnknownArea);
  }

  const targetCodes = getRegionCodes(regionData, targetRegion);
  if (targetCodes.size === 0) return [];

  return notifications.filter(n => matchesRegionName(n, targetRegion, targetCodes, regionData, gridMatrix));
}

/**
 * 一次掃描把通知分到多個地區名稱底下。
 * 等同於對每個名稱各呼叫一次 filterNotificationsByRegionName,但只掃通知一遍
 * (統計頁要算 22 縣市 / 數十鄉鎮區,逐一過濾會是 O(地區數 × 通知數))。
 */
export function bucketNotificationsByRegions(
  notifications: NotificationRecord[],
  regionNames: string[],
  regionData: RegionData,
  gridMatrix: Map<string, number>
): Map<string, NotificationRecord[]> {
  const buckets = new Map<string, NotificationRecord[]>(regionNames.map(name => [name, []]));
  const namesByCode = new Map<number, string[]>();
  const plainNames: string[] = [];

  for (const name of regionNames) {
    if (name === NATIONWIDE_REGION || name === UNKNOWN_AREA_REGION) continue;
    plainNames.push(name);
    for (const code of getRegionCodes(regionData, name)) {
      const names = namesByCode.get(code);
      if (names) names.push(name);
      else namesByCode.set(code, [name]);
    }
  }

  const nationwide = buckets.get(NATIONWIDE_REGION);
  const unknownArea = buckets.get(UNKNOWN_AREA_REGION);

  for (const notification of notifications) {
    const match = matchNotificationToRegions(notification, regionData, gridMatrix);
    if (nationwide && match.isNationwide) nationwide.push(notification);
    if (unknownArea && match.isUnknownArea) unknownArea.push(notification);

    const hits = new Set<string>();
    for (const code of match.matchedRegions) {
      const names = namesByCode.get(code);
      if (names) for (const name of names) hits.add(name);
    }
    for (const name of plainNames) {
      if (notification.title.includes(name)) hits.add(name);
    }
    // 依 regionNames 的順序寫入,讓每個 bucket 內仍維持原本的通知順序
    for (const name of plainNames) {
      if (hits.has(name)) buckets.get(name)!.push(notification);
    }
  }

  return buckets;
}
