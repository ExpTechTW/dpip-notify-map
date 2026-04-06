'use client';

import { useEffect, useRef, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { NotificationRecord } from '@/types/notify';
import { useRegionData, type RegionData } from '@/hooks/useRegionData';

interface MapViewProps {
  notification: NotificationRecord | null;
}

const TAIWAN_CENTER: [number, number] = [120.9605, 23.6978];
const CACHE_NAME = 'map-tiles-v1';
const TAIWAN_OVERVIEW_PAUSE_MS = 600;

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
  const lngSpan = ne.lng - sw.lng;
  const latSpan = ne.lat - sw.lat;
  if (lngSpan >= minDeg && latSpan >= minDeg) return bounds;
  const c = bounds.getCenter();
  const h = minDeg / 2;
  return new maplibregl.LngLatBounds([c.lng - h, c.lat - h], [c.lng + h, c.lat + h]);
}

function extendBoundsFromPolygonFeatures(
  features: GeoJSON.Feature[],
  into: maplibregl.LngLatBounds
) {
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') {
      g.coordinates[0]?.forEach(c => into.extend(c as [number, number]));
    } else if (g.type === 'MultiPolygon') {
      g.coordinates.forEach(p => p[0]?.forEach(c => into.extend(c as [number, number])));
    }
  }
}

function flyTaiwanOverviewThen(
  m: maplibregl.Map,
  isStale: () => boolean,
  runZoomIn: () => void
) {
  m.flyTo({
    center: TAIWAN_CENTER,
    zoom: getInitialZoom(),
    duration: 450,
    padding: getPadding(),
    essential: true,
  });
  m.once('moveend', () => {
    if (isStale()) return;
    m.once('idle', () => {
      if (isStale()) return;
      window.setTimeout(() => {
        if (!isStale()) runZoomIn();
      }, TAIWAN_OVERVIEW_PAUSE_MS);
    });
  });
}

function tryFitTownCodes(
  m: maplibregl.Map,
  codes: number[],
  fitOpts: maplibregl.FitBoundsOptions
): boolean {
  try {
    const features = m.querySourceFeatures('map', {
      sourceLayer: 'town',
      filter: ['in', ['get', 'CODE'], ['literal', codes]],
    }) as GeoJSON.Feature[];
    if (!features.length) return false;
    const b = new maplibregl.LngLatBounds();
    extendBoundsFromPolygonFeatures(features, b);
    if (b.isEmpty()) return false;
    m.fitBounds(b, fitOpts);
    return true;
  } catch {
    return false;
  }
}

function tryFitTownCodesFromRegion(
  m: maplibregl.Map,
  regionData: RegionData,
  codes: number[],
  fitOpts: maplibregl.FitBoundsOptions
): boolean {
  const b = boundsFromRegionCodes(regionData, codes);
  if (!b) return false;
  m.fitBounds(ensureMinLngLatSpan(b), fitOpts);
  return true;
}

// Cache API tiles 快取
function transformRequest(url: string): { url: string } | undefined {
  if (!url.includes('basemaps.cartocdn.com') && !url.includes('exptech.dev')) return undefined;

  if (typeof caches !== 'undefined') {
    caches.open(CACHE_NAME).then(cache => {
      cache.match(url).then(cached => {
        if (!cached) {
          fetch(url).then(res => {
            if (res.ok) cache.put(url, res);
          }).catch(() => {});
        }
      });
    }).catch(() => {});
  }

  return { url };
}

export default function MapView({ notification }: MapViewProps) {
  const { regionData } = useRegionData();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const versionRef = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
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
          map: {
            type: 'vector',
            url: 'https://lb.exptech.dev/api/v1/map/tiles/tiles.json',
          },
        },
        layers: [
          { id: 'carto-dark', type: 'raster', source: 'carto-dark' },
          {
            id: 'county-fill', type: 'fill', source: 'map', 'source-layer': 'city',
            paint: { 'fill-color': 'transparent' },
          },
          {
            id: 'county-outline', type: 'line', source: 'map', 'source-layer': 'city',
            paint: { 'line-color': '#64748b', 'line-width': 1.8, 'line-opacity': 0.6 },
          },
          {
            id: 'town-outline', type: 'line', source: 'map', 'source-layer': 'town',
            paint: { 'line-color': '#475569', 'line-width': 0.5, 'line-opacity': 0.35 },
          },
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

    map.current.touchZoomRotate.disableRotation();
    map.current.keyboard.disableRotation();
    map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.current.on('error', () => {});

    const container = mapContainer.current;
    const ro =
      typeof ResizeObserver !== 'undefined' && container
        ? new ResizeObserver(() => {
            map.current?.resize();
          })
        : null;
    ro?.observe(container);
    queueMicrotask(() => map.current?.resize());

    return () => {
      ro?.disconnect();
      map.current?.remove();
    };
  }, []);

  const processedGeoJSON = useMemo(() => {
    if (!notification?.Polygons?.length) return null;

    const features = notification.Polygons.filter(p => {
      if ('type' in p && p.type === 'Feature' && 'geometry' in p && p.geometry)
        return Array.isArray(p.geometry.coordinates);
      if ('coordinates' in p) return Array.isArray(p.coordinates);
      return false;
    }).map((p, i) => {
      if ('type' in p && p.type === 'Feature' && 'geometry' in p && p.geometry)
        return { ...p, properties: { ...p.properties, id: i } };
      if ('coordinates' in p)
        return { type: 'Feature' as const, properties: { id: i }, geometry: { type: 'Polygon' as const, coordinates: p.coordinates } };
      return { type: 'Feature' as const, properties: { id: i }, geometry: { type: 'Polygon' as const, coordinates: [] } };
    });

    return features.length ? { type: 'FeatureCollection' as const, features } : null;
  }, [notification?.Polygons]);

  const notificationBounds = useMemo(() => {
    if (!notification) return null;
    if (notification.codes?.length) return { type: 'codes' as const, codes: notification.codes };
    if (notification.Polygons?.length) {
      const bounds = new maplibregl.LngLatBounds();
      notification.Polygons.forEach(p => {
        const coords = 'coordinates' in p ? p.coordinates : p.geometry?.coordinates;
        if (!coords) return;
        coords.forEach(ring => ring.forEach(c => { if (c?.length >= 2) bounds.extend([c[0], c[1]]); }));
      });
      if (!bounds.isEmpty()) return { type: 'polygon' as const, bounds };
    }
    return null;
  }, [notification]);

  const clearLayers = useCallback(() => {
    const m = map.current;
    if (!m) return;
    ['notification-polygons-fill', 'notification-polygons-line', 'notification-codes-fill', 'notification-codes-line'].forEach(id => {
      try { if (m.getLayer(id)) m.removeLayer(id); } catch {}
    });
    try { if (m.getSource('notification-polygons')) m.removeSource('notification-polygons'); } catch {}
  }, []);

  const applyNotification = useCallback((
    n: NotificationRecord,
    bounds: typeof notificationBounds,
    geoJSON: typeof processedGeoJSON,
    version: number,
    regions: RegionData | null
  ) => {
    const m = map.current;
    if (!m || versionRef.current !== version) return;

    m.stop();
    clearLayers();

    if (n.codes?.length) {
      try {
        m.addLayer({
          id: 'notification-codes-fill', type: 'fill', source: 'map', 'source-layer': 'town',
          filter: ['in', ['get', 'CODE'], ['literal', n.codes]],
          paint: { 'fill-color': n.critical ? '#f87171' : '#60a5fa', 'fill-opacity': 0.4 },
        });
        m.addLayer({
          id: 'notification-codes-line', type: 'line', source: 'map', 'source-layer': 'town',
          filter: ['in', ['get', 'CODE'], ['literal', n.codes]],
          paint: {
            'line-color': n.critical ? '#ef4444' : '#3b82f6',
            'line-width': 2.5,
            'line-opacity': 0.85,
          },
        });
      } catch {}
    }

    if (geoJSON && versionRef.current === version) {
      m.addSource('notification-polygons', { type: 'geojson', data: geoJSON });
      m.addLayer({
        id: 'notification-polygons-fill', type: 'fill', source: 'notification-polygons',
        paint: { 'fill-color': n.critical ? '#ef4444' : '#3b82f6', 'fill-opacity': 0.2 },
      });
      m.addLayer({
        id: 'notification-polygons-line', type: 'line', source: 'notification-polygons',
        paint: { 'line-color': n.critical ? '#dc2626' : '#2563eb', 'line-width': 2 },
      });
    }

    if (!bounds || versionRef.current !== version) return;

    const stale = () => versionRef.current !== version || !map.current;

    const codesFit: maplibregl.FitBoundsOptions = {
      padding: getPadding(),
      maxZoom: isNarrowScreen() ? 10 : 11,
      duration: 550,
      essential: true,
    };
    const polygonFit: maplibregl.FitBoundsOptions = {
      padding: getPadding(),
      maxZoom: isNarrowScreen() ? 11 : 12,
      duration: 400,
      essential: true,
    };

    if (bounds.type === 'codes') {
      flyTaiwanOverviewThen(m, stale, () => {
        const mm = map.current;
        if (!mm) return;
        if (!tryFitTownCodes(mm, bounds.codes, codesFit) && regions) {
          tryFitTownCodesFromRegion(mm, regions, bounds.codes, codesFit);
        }
      });
    } else if (bounds.type === 'polygon') {
      const target = bounds.bounds;
      flyTaiwanOverviewThen(m, stale, () => {
        map.current?.fitBounds(target, polygonFit);
      });
    }
  }, [clearLayers]);

  useEffect(() => {
    if (!map.current || !notification) return;

    const version = ++versionRef.current;
    map.current.stop();

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      if (versionRef.current !== version || !map.current) return;

      const run = () => applyNotification(notification, notificationBounds, processedGeoJSON, version, regionData);

      if (map.current.isStyleLoaded()) run();
      else map.current.once('load', run);
    }, 30);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      clearLayers();
    };
  }, [notification, notificationBounds, processedGeoJSON, regionData, applyNotification, clearLayers]);

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
