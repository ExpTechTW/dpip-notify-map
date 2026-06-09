'use client';

import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { NotificationRecord } from '@/types/notify';
import { useRegionData, type RegionData } from '@/hooks/useRegionData';

interface MapViewProps {
  notification: NotificationRecord | null;
}

const TAIWAN_CENTER: [number, number] = [120.9605, 23.6978];
const CACHE_NAME = 'map-tiles-v1';
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function getInitialZoom() {
  return typeof window !== 'undefined' && window.innerWidth < 768 ? 6.5 : 7;
}

function getPadding() {
  return typeof window !== 'undefined' && window.innerWidth < 768 ? 30 : 60;
}

function isNarrowScreen() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

function boundsFromRegionCodes(regionData: RegionData, codes: number[]): maplibregl.LngLatBounds | null {
  const want = new Set(codes);
  const b = new maplibregl.LngLatBounds();
  for (const districts of Object.values(regionData)) {
    for (const { code, lon, lat } of Object.values(districts)) {
      if (want.has(code)) b.extend([lon, lat]);
    }
  }
  return b.isEmpty() ? null : b;
}

function ensureMinLngLatSpan(bounds: maplibregl.LngLatBounds, minDeg = 0.08): maplibregl.LngLatBounds {
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  if (ne.lng - sw.lng >= minDeg && ne.lat - sw.lat >= minDeg) return bounds;
  const c = bounds.getCenter();
  const h = minDeg / 2;
  return new maplibregl.LngLatBounds([c.lng - h, c.lat - h], [c.lng + h, c.lat + h]);
}

// 把通知的 Polygons 轉成 GeoJSON FeatureCollection(無多邊形時回空集合)。
function buildPolygonGeoJSON(n: NotificationRecord | null): GeoJSON.FeatureCollection {
  if (!n?.Polygons?.length) return EMPTY_FC;
  const features: GeoJSON.Feature[] = [];
  n.Polygons.forEach((p, i) => {
    if ('geometry' in p && p.geometry && Array.isArray(p.geometry.coordinates)) {
      features.push({ type: 'Feature', properties: { ...(p.properties ?? {}), id: i }, geometry: { type: 'Polygon', coordinates: p.geometry.coordinates } });
    } else if ('coordinates' in p && Array.isArray(p.coordinates)) {
      features.push({ type: 'Feature', properties: { id: i }, geometry: { type: 'Polygon', coordinates: p.coordinates } });
    }
  });
  return { type: 'FeatureCollection', features };
}

// 由通知算出要框選的範圍。優先用 regionData(確定值,不依賴已載入圖磚 → 任何切換速度都穩定),
// 其次用多邊形座標;都沒有則回 null(不移動)。
function computeBounds(n: NotificationRecord | null, regionData: RegionData | null): maplibregl.LngLatBounds | null {
  if (!n) return null;
  if (n.codes?.length && regionData) {
    const b = boundsFromRegionCodes(regionData, n.codes);
    if (b) return ensureMinLngLatSpan(b);
  }
  if (n.Polygons?.length) {
    const b = new maplibregl.LngLatBounds();
    n.Polygons.forEach(p => {
      const coords = 'coordinates' in p ? p.coordinates : p.geometry?.coordinates;
      coords?.forEach(ring => ring.forEach(c => { if (c?.length >= 2) b.extend([c[0], c[1]]); }));
    });
    if (!b.isEmpty()) return b;
  }
  return null;
}

// Cache API tiles 快取
function transformRequest(url: string): { url: string } | undefined {
  if (!url.includes('basemaps.cartocdn.com') && !url.includes('exptech.dev')) return undefined;
  if (typeof caches !== 'undefined') {
    caches.open(CACHE_NAME).then(cache => {
      cache.match(url).then(cached => {
        if (!cached) {
          fetch(url).then(res => { if (res.ok) cache.put(url, res); }).catch(() => {});
        }
      });
    }).catch(() => {});
  }
  return { url };
}

export default function MapView({ notification }: MapViewProps) {
  const { regionData } = useRegionData();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // 最新輸入放進 ref,讓 applySelection() 永遠讀到最新值且本身保持穩定(不需重建)。
  const notifRef = useRef<NotificationRecord | null>(notification);
  const regionRef = useRef<RegionData | null>(regionData);
  const loadedRef = useRef(false); // 地圖是否已觸發過一次 load(之後就一直可用)
  notifRef.current = notification;
  regionRef.current = regionData;

  // 套用目前選取:建立圖層(一次)+ 更新高亮(setFilter/setData/setPaint)+ 慢速運鏡(fitBounds)。
  // 就緒判斷用 loadedRef(首次 load 後恆為 true),不可用 isStyleLoaded():後者在圖磚載入時會
  // 反覆轉回 false,若拿它當守衛,load 之後的更新(例:regionData 晚到才算得出 code 的範圍)
  // 會被誤判未就緒、註冊永不再觸發的 once('load') → 第一個通知永遠不框。
  // 放慢 fitBounds duration,讓遠距切換的「拉遠看全台 → 拉近」看得清相對位置。
  const applySelection = useCallback(() => {
    const m = mapRef.current;
    // 已 load 過(loadedRef)或樣式此刻就緒(涵蓋 HMR 沿用舊 map、load 已錯過的情況)才套用;
    // 兩者皆否 → 尚未就緒,由 load handler 補呼叫。
    if (!m || (!loadedRef.current && !m.isStyleLoaded())) return;
    loadedRef.current = true;
    try {
      // 通知圖層只建立一次(冪等:已存在就跳過),之後切換通知都只用 setData/setFilter 更新。
      if (!m.getLayer('notif-codes-fill')) {
        const NONE: maplibregl.FilterSpecification = ['in', ['get', 'CODE'], ['literal', []]];
        if (!m.getSource('notif-poly')) m.addSource('notif-poly', { type: 'geojson', data: EMPTY_FC });
        m.addLayer({ id: 'notif-codes-fill', type: 'fill', source: 'map', 'source-layer': 'town', filter: NONE, paint: { 'fill-color': '#60a5fa', 'fill-opacity': 0.4 } });
        m.addLayer({ id: 'notif-codes-line', type: 'line', source: 'map', 'source-layer': 'town', filter: NONE, paint: { 'line-color': '#3b82f6', 'line-width': 2.5, 'line-opacity': 0.85 } });
        m.addLayer({ id: 'notif-poly-fill', type: 'fill', source: 'notif-poly', paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.2 } });
        m.addLayer({ id: 'notif-poly-line', type: 'line', source: 'notif-poly', paint: { 'line-color': '#2563eb', 'line-width': 2 } });
      }

      const n = notifRef.current;
      const critical = !!n?.critical;
      const codes = n?.codes?.length ? n.codes : [];
      m.setFilter('notif-codes-fill', ['in', ['get', 'CODE'], ['literal', codes]]);
      m.setFilter('notif-codes-line', ['in', ['get', 'CODE'], ['literal', codes]]);
      m.setPaintProperty('notif-codes-fill', 'fill-color', critical ? '#f87171' : '#60a5fa');
      m.setPaintProperty('notif-codes-line', 'line-color', critical ? '#ef4444' : '#3b82f6');

      (m.getSource('notif-poly') as maplibregl.GeoJSONSource | undefined)?.setData(buildPolygonGeoJSON(n));
      m.setPaintProperty('notif-poly-fill', 'fill-color', critical ? '#ef4444' : '#3b82f6');
      m.setPaintProperty('notif-poly-line', 'line-color', critical ? '#dc2626' : '#2563eb');

      const b = computeBounds(n, regionRef.current);
      if (b) m.fitBounds(b, { padding: getPadding(), maxZoom: isNarrowScreen() ? 11 : 12, duration: 1100, essential: true });
    } catch {}
  }, []);

  // 建立地圖(僅一次)+ 載入後一次性建立通知圖層(空狀態)
  useEffect(() => {
    if (!mapContainer.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
          },
          map: { type: 'vector', url: 'https://lb.exptech.dev/api/v1/map/tiles/tiles.json' },
        },
        layers: [
          { id: 'carto-dark', type: 'raster', source: 'carto-dark' },
          { id: 'county-fill', type: 'fill', source: 'map', 'source-layer': 'city', paint: { 'fill-color': 'transparent' } },
          { id: 'county-outline', type: 'line', source: 'map', 'source-layer': 'city', paint: { 'line-color': '#64748b', 'line-width': 1.8, 'line-opacity': 0.6 } },
          { id: 'town-outline', type: 'line', source: 'map', 'source-layer': 'town', paint: { 'line-color': '#475569', 'line-width': 0.5, 'line-opacity': 0.35 } },
        ],
      },
      center: TAIWAN_CENTER,
      zoom: getInitialZoom(),
      maxBounds: [[115, 20], [127, 27.5]],
      minZoom: 5,
      maxZoom: 14,
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
      transformRequest,
    });
    mapRef.current = m;

    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('error', () => {});
    // 首次 load:標記已載入並套用目前選取(高亮 + 可見的慢速運鏡)。
    m.on('load', () => { loadedRef.current = true; applySelection(); });

    const container = mapContainer.current;
    const ro = typeof ResizeObserver !== 'undefined' && container
      ? new ResizeObserver(() => mapRef.current?.resize())
      : null;
    ro?.observe(container);
    queueMicrotask(() => mapRef.current?.resize());

    return () => {
      ro?.disconnect();
      loadedRef.current = false;
      m.remove();
      mapRef.current = null;
    };
  }, [applySelection]);

  // 通知 / regionData 變更 → 套用高亮並播放可見的慢速運鏡。
  // 「給地圖時間、避免過快切換」的節流改由上層(清單選取)負責,此處不遮住地圖。
  useEffect(() => {
    applySelection();
  }, [notification, regionData, applySelection]);

  return (
    <div className="relative h-full overflow-hidden md:rounded-xl">
      <div ref={mapContainer} className="h-full w-full" />
      {!notification && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-muted/40 via-background/92 to-background/95 backdrop-blur-[2px]">
          <div className="mx-auto max-w-xs rounded-2xl border border-border/50 bg-card/90 p-8 text-center shadow-lg shadow-black/[0.06]">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
              <svg className="size-7 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-foreground">地圖預覽</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">從左側列表選一則通知，即可在地圖上檢視影響範圍</p>
          </div>
        </div>
      )}
    </div>
  );
}
