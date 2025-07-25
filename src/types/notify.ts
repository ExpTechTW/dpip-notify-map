export interface NotificationRecord {
  timestamp: string;
  title: string;
  body: string;
  codes: string[];
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