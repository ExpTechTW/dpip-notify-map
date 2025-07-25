'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { NotificationRecord } from '@/types/notify';

interface MapViewProps {
  notification: NotificationRecord | null;
}

export default function MapView({ notification }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
          },
        ],
      },
      center: [120.9605, 23.6978], // 台灣中心
      zoom: 7,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    return () => {
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current || !notification?.Polygons?.length) return;

    // 清除之前的多邊形
    if (map.current.getSource('notification-polygons')) {
      map.current.removeLayer('notification-polygons-fill');
      map.current.removeLayer('notification-polygons-line');
      map.current.removeSource('notification-polygons');
    }

    // 處理不同的資料格式
    const features = notification.Polygons.filter(polygon => {
      // 檢查是否是 GeoJSON Feature 格式
      if ('type' in polygon && polygon.type === 'Feature' && 'geometry' in polygon && polygon.geometry) {
        return polygon.geometry.coordinates && Array.isArray(polygon.geometry.coordinates);
      }
      // 檢查是否是直接的座標格式
      if ('coordinates' in polygon) {
        return polygon.coordinates && Array.isArray(polygon.coordinates);
      }
      return false;
    }).map((polygon, index) => {
      // 如果是 GeoJSON Feature 格式，直接使用
      if ('type' in polygon && polygon.type === 'Feature' && 'geometry' in polygon && polygon.geometry) {
        return {
          ...polygon,
          properties: {
            ...polygon.properties,
            id: index,
            notification: notification.title,
          }
        };
      }
      // 如果是直接座標格式，轉換為 GeoJSON Feature
      if ('coordinates' in polygon) {
        return {
          type: 'Feature' as const,
          properties: {
            id: index,
            notification: notification.title,
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: polygon.coordinates,
          },
        };
      }
      // 預設情況
      return {
        type: 'Feature' as const,
        properties: {
          id: index,
          notification: notification.title,
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [],
        },
      };
    });

    if (features.length === 0) return;

    const geojson = {
      type: 'FeatureCollection' as const,
      features,
    };

    map.current.addSource('notification-polygons', {
      type: 'geojson',
      data: geojson,
    });

    map.current.addLayer({
      id: 'notification-polygons-fill',
      type: 'fill',
      source: 'notification-polygons',
      paint: {
        'fill-color': notification.critical ? '#ef4444' : '#3b82f6',
        'fill-opacity': 0.3,
      },
    });

    map.current.addLayer({
      id: 'notification-polygons-line',
      type: 'line',
      source: 'notification-polygons',
      paint: {
        'line-color': notification.critical ? '#dc2626' : '#2563eb',
        'line-width': 2,
      },
    });

    // 調整視角以顯示多邊形
    if (features.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      features.forEach(feature => {
        if (feature.geometry.coordinates && feature.geometry.coordinates[0]) {
          feature.geometry.coordinates[0].forEach(coord => {
            if (coord && coord.length >= 2) {
              bounds.extend([coord[0], coord[1]]);
            }
          });
        }
      });
      if (!bounds.isEmpty()) {
        map.current.fitBounds(bounds, { padding: 50 });
      }
    }

    // 添加點擊事件
    const clickHandler = (e: maplibregl.MapMouseEvent) => {
      const features = map.current!.queryRenderedFeatures(e.point, {
        layers: ['notification-polygons-fill'],
      });

      if (features.length > 0) {
        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="p-2">
              <h4 class="font-semibold text-sm">${notification.title}</h4>
              <p class="text-xs text-gray-600 mt-1">${notification.body}</p>
              <p class="text-xs text-gray-500 mt-2">
                ${new Date(notification.timestamp).toLocaleString('zh-TW')}
              </p>
            </div>
          `)
          .addTo(map.current!);
      }
    };

    map.current.on('click', 'notification-polygons-fill', clickHandler);

    // 鼠標樣式
    map.current.on('mouseenter', 'notification-polygons-fill', () => {
      map.current!.getCanvas().style.cursor = 'pointer';
    });

    map.current.on('mouseleave', 'notification-polygons-fill', () => {
      map.current!.getCanvas().style.cursor = '';
    });

    return () => {
      if (map.current) {
        map.current.off('click', 'notification-polygons-fill', clickHandler);
      }
    };
  }, [notification]);

  return (
    <div className="h-full relative rounded-lg overflow-hidden">
      <div ref={mapContainer} className="h-full w-full" />
      {!notification && (
        <div className="absolute inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">地圖視圖</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              選擇左側的通知項目以在地圖上查看相關的地理範圍與詳細資訊
            </p>
          </div>
        </div>
      )}
      
      {/* 地圖控制面板 */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-background/95 backdrop-blur-sm border border-border/50 rounded-lg p-3 shadow-sm">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <div className="w-3 h-3 bg-primary rounded-full"></div>
            <span>通知範圍</span>
          </div>
        </div>
      </div>
    </div>
  );
}