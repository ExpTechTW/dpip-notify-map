export interface NotificationRecord {
  timestamp: number;
  title: string;
  body: string;
  codes: number[];
  Polygons: (Polygon | GeoJSONFeature)[];
  critical: boolean;
}

export interface Polygon {
  coordinates: number[][][];
  type: string;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties?: Record<string, unknown>;
}

export interface NotifyHistoryResponse {
  success: boolean;
  count: number;
  records: NotificationRecord[];
}