'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useTheme } from 'next-themes';
import { Layers, Mountain } from 'lucide-react';
import { NotificationRecord } from '@/types/notify';
import { useRegionData, type RegionData } from '@/hooks/useRegionData';
import { cn } from '@/lib/utils';
import {
  BASE_MAP_MODES,
  DEFAULT_BASE_MAP_MODE,
  EMPTY_FEATURE_COLLECTION,
  NOTIF_COLORS,
  NOTIF_LAYERS,
  NOTIF_POLY_SOURCE,
  buildMapStyle,
  type BaseMapMode,
} from '@/lib/map-style';

interface MapViewProps {
  notification: NotificationRecord | null;
}

const TAIWAN_CENTER: [number, number] = [120.9605, 23.6978];
const BASE_MAP_STORAGE_KEY = 'dpip-notify-map:basemap';

function isNarrowScreen() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

function readStoredMode(): BaseMapMode {
  try {
    const saved = window.localStorage.getItem(BASE_MAP_STORAGE_KEY);
    return BASE_MAP_MODES.some(m => m.value === saved) ? (saved as BaseMapMode) : DEFAULT_BASE_MAP_MODE;
  } catch {
    return DEFAULT_BASE_MAP_MODE;
  }
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
  if (!n?.Polygons?.length) return EMPTY_FEATURE_COLLECTION;
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

export default function MapView({ notification }: MapViewProps) {
  const { regionData } = useRegionData();
  const { resolvedTheme } = useTheme();
  const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>(DEFAULT_BASE_MAP_MODE);
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // 最新輸入放進 ref,讓 applySelection() 永遠讀到最新值且本身保持穩定(不需重建)。
  const notifRef = useRef<NotificationRecord | null>(notification);
  const regionRef = useRef<RegionData | null>(regionData);
  const loadedRef = useRef(false); // 地圖是否已觸發過一次 load(之後就一直可用)
  notifRef.current = notification;
  regionRef.current = regionData;

  // 底圖模式存在 localStorage;mount 後才讀,避免 SSR 與首次 CSR 渲染不一致
  useEffect(() => { setBaseMapMode(readStoredMode()); }, []);

  // 主題要等 next-themes 解析完才建地圖,否則淺色使用者會先閃一下深色底圖
  const dark = resolvedTheme !== 'light';
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => { if (resolvedTheme) setThemeReady(true); }, [resolvedTheme]);

  // 建圖當下要用的樣式參數(建圖 effect 只跑一次,故用 ref 取最新值)
  const styleRef = useRef({ dark, mode: baseMapMode });
  styleRef.current = { dark, mode: baseMapMode };

  // 套用目前選取:更新高亮(setFilter/setData/setPaint);fit 為 true 時再播放慢速運鏡。
  // 就緒判斷用 loadedRef(首次 load 後恆為 true),不可用 isStyleLoaded():後者在圖磚載入時會
  // 反覆轉回 false,若拿它當守衛,load 之後的更新(例:regionData 晚到才算得出 code 的範圍)
  // 會被誤判未就緒、註冊永不再觸發的 once('load') → 第一個通知永遠不框。
  // 放慢 fitBounds duration,讓遠距切換的「拉遠看全台 → 拉近」看得清相對位置。
  const applySelection = useCallback((fit: boolean) => {
    const m = mapRef.current;
    // 已 load 過(loadedRef)或樣式此刻就緒(涵蓋 HMR 沿用舊 map、load 已錯過的情況)才套用;
    // 兩者皆否 → 尚未就緒,由 load handler 補呼叫。
    if (!m || (!loadedRef.current && !m.isStyleLoaded())) return;
    loadedRef.current = true;
    try {
      const n = notifRef.current;
      const critical = !!n?.critical;
      const pick = (c: { normal: string; critical: string }) => (critical ? c.critical : c.normal);
      const codes = n?.codes?.length ? n.codes : [];
      const codeFilter: maplibregl.FilterSpecification = ['in', ['get', 'CODE'], ['literal', codes]];

      m.setFilter(NOTIF_LAYERS.codesFill, codeFilter);
      m.setFilter(NOTIF_LAYERS.codesLine, codeFilter);
      m.setPaintProperty(NOTIF_LAYERS.codesFill, 'fill-color', pick(NOTIF_COLORS.codesFill));
      m.setPaintProperty(NOTIF_LAYERS.codesLine, 'line-color', pick(NOTIF_COLORS.codesLine));

      (m.getSource(NOTIF_POLY_SOURCE) as maplibregl.GeoJSONSource | undefined)?.setData(buildPolygonGeoJSON(n));
      m.setPaintProperty(NOTIF_LAYERS.polyFill, 'fill-color', pick(NOTIF_COLORS.polyFill));
      m.setPaintProperty(NOTIF_LAYERS.polyLine, 'line-color', pick(NOTIF_COLORS.polyLine));

      if (!fit) return;
      const b = computeBounds(n, regionRef.current);
      if (b) {
        const narrow = isNarrowScreen();
        m.fitBounds(b, { padding: narrow ? 30 : 60, maxZoom: narrow ? 11 : 12, duration: 1100, essential: true });
      }
    } catch {}
  }, []);

  // 建立地圖(僅一次,等主題解析完)
  useEffect(() => {
    if (!themeReady || !mapContainer.current || mapRef.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: buildMapStyle(styleRef.current.dark, styleRef.current.mode),
      center: TAIWAN_CENTER,
      zoom: isNarrowScreen() ? 6.5 : 7,
      maxBounds: [[115, 20], [127, 27.5]],
      minZoom: 5,
      // GIS 圖層的建物 z13 起、門牌 z16 起,拉得夠近才看得到細節
      maxZoom: 17,
      dragRotate: false,
      pitchWithRotate: false,
      touchZoomRotate: true,
    });
    mapRef.current = m;

    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    m.on('error', () => {});
    // 首次 load:標記已載入並套用目前選取(高亮 + 可見的慢速運鏡)。
    m.on('load', () => { loadedRef.current = true; applySelection(true); });

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
  }, [themeReady, applySelection]);

  // 主題 / 底圖模式改變 → setStyle 差異更新(底圖向量圖磚不會重抓),再補回高亮但不動鏡頭
  const appliedStyleRef = useRef<string | null>(null);
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const key = `${dark ? 'dark' : 'light'}|${baseMapMode}`;
    // 建圖當下用的就是這組參數,第一次不必重跑
    if (appliedStyleRef.current === null) { appliedStyleRef.current = key; return; }
    if (appliedStyleRef.current === key) return;
    appliedStyleRef.current = key;
    m.setStyle(buildMapStyle(dark, baseMapMode));
    m.once('styledata', () => applySelection(false));
  }, [dark, baseMapMode, themeReady, applySelection]);

  // 通知 / regionData 變更 → 套用高亮並播放可見的慢速運鏡。
  // 「給地圖時間、避免過快切換」的節流改由上層(清單選取)負責,此處不遮住地圖。
  useEffect(() => {
    applySelection(true);
  }, [notification, regionData, applySelection]);

  const changeBaseMapMode = useCallback((mode: BaseMapMode) => {
    setBaseMapMode(mode);
    try { window.localStorage.setItem(BASE_MAP_STORAGE_KEY, mode); } catch {}
  }, []);

  return (
    <div className="relative h-full overflow-hidden md:rounded-xl">
      <div ref={mapContainer} className="h-full w-full" />

      {/* 底圖切換:地形浮雕 / GIS 街道圖(互斥,GIS 自帶地表) */}
      <div className="absolute left-2 top-2 z-20 flex gap-0.5 rounded-xl border border-border/60 bg-background/85 p-0.5 shadow-sm backdrop-blur-md">
        {BASE_MAP_MODES.map(({ value, label }) => {
          const Icon = value === 'terrain' ? Mountain : Layers;
          const active = baseMapMode === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => changeBaseMapMode(value)}
              className={cn(
                'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold transition',
                active ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

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
