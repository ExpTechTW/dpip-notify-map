export interface NotificationRecord {
  timestamp: number;
  title: string;
  body: string;
  codes: number[];
  Polygons: (Polygon | GeoJSONFeature)[];
  critical: boolean;
  /** 推播送達數(後端統計;SNS 廣播或舊資料為 0) */
  devices?: { ios: number; android: number };
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