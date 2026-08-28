import type {
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';

/**
 * 底圖樣式,對齊 DPIP app 的製圖(lib/shared/map/map_style.dart、map_gsi_overlay.dart)。
 *
 * 底圖是 ExpTech 向量圖磚,顏色由本檔自己上(不吃第三方點陣底圖),因此可跟著網頁的
 * 深淺色主題走。底圖之上二選一:
 *   - `terrain`:raster-dem 地形浮雕(hillshade)
 *   - `gis`:OpenMapTiles(OSM)街道 / 建物 / 水系詳細圖層
 * 兩者互斥 —— GIS 圖層自帶地表,疊上地形只會互相打架(DPIP 也是這樣處理)。
 */
export type BaseMapMode = 'gis' | 'terrain';

export const DEFAULT_BASE_MAP_MODE: BaseMapMode = 'gis';

export const BASE_MAP_MODES: { value: BaseMapMode; label: string }[] = [
  { value: 'gis', label: 'GIS' },
  { value: 'terrain', label: '地形' },
];

const BASEMAP_TILE_URL = 'https://static.lb.exptech.dev/api/v1/map/tiles/{z}/{x}/{y}.pbf';
const TERRAIN_TILE_URL = 'https://static.lb.exptech.dev/api/v1/map/terrain/{z}/{x}/{y}.png';
const GIS_TILE_URL = 'https://static.lb.exptech.dev/api/v1/map/gsi/{z}/{x}/{y}.pbf';
const GLYPHS_URL = 'https://cdn.jsdelivr.net/gh/exptechtw/map-assets/{fontstack}/{range}.pbf';

const FONT = ['Noto Sans TC Regular'];

/** OSM 圖層取名的慣例:優先中文,退回英文 */
const NAME_FIELD = ['coalesce', ['get', 'name'], ['get', 'name:en'], ['get', 'name_int']];

/** 圖層 id —— 選取高亮要插在這之下,縣市界才不會被蓋掉 */
export const TOWN_OUTLINE_LAYER = 'town-outline';

export const NOTIF_POLY_SOURCE = 'notif-poly';
export const NOTIF_LAYERS = {
  codesFill: 'notif-codes-fill',
  codesLine: 'notif-codes-line',
  polyFill: 'notif-poly-fill',
  polyLine: 'notif-poly-line',
} as const;

/** 沒有選取任何地區代碼時的過濾條件 */
export const NO_CODES: FilterSpecification = ['in', ['get', 'CODE'], ['literal', []]];

export const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/** 底圖配色(取自 DPIP MapColors) */
interface Palette {
  background: string;
  fill: string;
  outline: string;
  townOutline: string;
}

const PALETTE: Record<'dark' | 'light', Palette> = {
  dark: { background: '#1f2025', fill: '#3F4045', outline: '#a9b4bc', townOutline: '#6A6B72' },
  light: { background: '#E0E0E0', fill: '#ADADAD', outline: '#6B6B6B', townOutline: '#9A9A9A' },
};

/** 通知範圍高亮的顏色(critical 走紅色) */
export const NOTIF_COLORS = {
  codesFill: { normal: '#60a5fa', critical: '#f87171' },
  codesLine: { normal: '#3b82f6', critical: '#ef4444' },
  polyFill: { normal: '#3b82f6', critical: '#ef4444' },
  polyLine: { normal: '#2563eb', critical: '#dc2626' },
} as const;

/**
 * OSM 詳細圖層。id / source-layer / 篩選 / 配色皆比照 DPIP `gsiStyleLayers`。
 * DPIP 預設關閉的 parks 與 boundaries 群組這裡不放(本站沒有分群開關)。
 */
function gisLayers(dark: boolean): LayerSpecification[] {
  const c = (d: string, l: string) => (dark ? d : l);
  const halo = c('#212837', '#F2F3F5');
  const text = c('#E8ECF2', '#25282E');
  const symbol = (id: string, sourceLayer: string, layout: object, paint: object, minzoom?: number) =>
    ({
      id, type: 'symbol', source: 'gis', 'source-layer': sourceLayer,
      ...(minzoom === undefined ? {} : { minzoom }),
      layout: { 'text-font': FONT, ...layout },
      paint: { 'text-halo-color': halo, ...paint },
    }) as LayerSpecification;

  return [
    {
      id: 'gis-landcover', type: 'fill', source: 'gis', 'source-layer': 'landcover',
      paint: {
        'fill-color': ['match', ['get', 'class'],
          'wood', c('#1F3324', '#CFE3CA'),
          'grass', c('#233A26', '#DBE8C9'),
          c('#212C22', '#E5E8DD')],
        'fill-opacity': 0.9,
      },
    },
    {
      id: 'gis-landuse', type: 'fill', source: 'gis', 'source-layer': 'landuse',
      paint: {
        'fill-color': ['match', ['get', 'class'],
          'residential', c('#242830', '#E3E1DD'),
          'commercial', c('#332226', '#EADADC'),
          'industrial', c('#2A2436', '#DDD8E8'),
          // 軍事用地維持中性色:紅色在 DPIP 代表警報
          'military', c('#2F2B33', '#D8D4DC'),
          'school', c('#332F1F', '#ECE6CC'),
          'university', c('#332F1F', '#ECE6CC'),
          'cemetery', c('#1F2C22', '#D6E4D7'),
          c('#242830', '#E3E1DD')],
        'fill-opacity': 0.85,
      },
    },
    {
      id: 'gis-aeroway-fill', type: 'fill', source: 'gis', 'source-layer': 'aeroway',
      filter: ['in', ['get', 'class'], ['literal', ['apron', 'aerodrome', 'heliport']]],
      paint: { 'fill-color': c('#2E2C3D', '#DEDCE8') },
    },
    {
      id: 'gis-aeroway-line', type: 'line', source: 'gis', 'source-layer': 'aeroway',
      filter: ['in', ['get', 'class'], ['literal', ['runway', 'taxiway']]],
      paint: {
        'line-color': c('#5B5578', '#8F89A7'),
        'line-width': ['match', ['get', 'class'], 'runway', 8, 3],
      },
    },
    {
      // 刻意透明:海的顏色由底圖負責,免得在 OSM 資料邊界出現一塊硬邊矩形
      id: 'gis-water', type: 'fill', source: 'gis', 'source-layer': 'water',
      paint: { 'fill-color': 'rgba(0,0,0,0)' },
    },
    {
      id: 'gis-waterway', type: 'line', source: 'gis', 'source-layer': 'waterway',
      paint: {
        'line-color': c('#2F6089', '#5F96C4'),
        'line-width': ['match', ['get', 'class'], 'river', 2.5, 'stream', 1.2, 1],
      },
    },
    {
      id: 'gis-building', type: 'fill', source: 'gis', 'source-layer': 'building', minzoom: 13,
      paint: { 'fill-color': c('#3A3A3F', '#D3D0CC'), 'fill-outline-color': c('#55555C', '#AAA59F') },
    },
    {
      // 道路外框(casing)+ 道路本體,兩層疊出邊線
      id: 'gis-road-case', type: 'line', source: 'gis', 'source-layer': 'transportation',
      filter: ['!=', ['get', 'class'], 'ferry'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c('#0C0E14', '#FFFFFF'),
        'line-width': ['interpolate', ['linear'], ['zoom'],
          8, ['match', ['get', 'class'], 'motorway', 1.2, 'trunk', 1, 'primary', 0.8, 0.4],
          16, ['match', ['get', 'class'], 'motorway', 14, 'trunk', 11, 'primary', 9,
            ['match', ['get', 'class'], 'service', 3, 'path', 2, 6]]],
      },
    },
    {
      id: 'gis-road', type: 'line', source: 'gis', 'source-layer': 'transportation',
      filter: ['!=', ['get', 'class'], 'ferry'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'class'],
          'motorway', c('#E8A33D', '#D4851F'),
          'trunk', c('#D99A4E', '#C7822D'),
          'primary', c('#C99A5F', '#B88942'),
          'secondary', c('#8F7A4F', '#9A8157'),
          'rail', c('#7A7A82', '#77777D'),
          'service', c('#3D3D44', '#C7C4BE'),
          'path', c('#5F5540', '#A89467'),
          c('#4A4A52', '#B7B3AD')],
        'line-width': ['interpolate', ['linear'], ['zoom'],
          8, ['match', ['get', 'class'], 'motorway', 1, 'trunk', 0.8, 'primary', 0.6, 0.3],
          16, ['match', ['get', 'class'], 'motorway', 11, 'trunk', 8, 'primary', 6.5,
            ['match', ['get', 'class'], 'service', 1.5, 'path', 1, 4]]],
      },
    },
    symbol('gis-road-name', 'transportation_name',
      { 'symbol-placement': 'line', 'text-field': NAME_FIELD, 'text-size': 11 },
      { 'text-color': c('#D9B877', '#725B25'), 'text-halo-width': 1.2 }, 13),
    symbol('gis-water-name', 'water_name',
      { 'text-field': NAME_FIELD, 'text-size': 12, 'text-letter-spacing': 0.05 },
      { 'text-color': c('#7CB3DE', '#326D9A'), 'text-halo-width': 1.2 }),
    symbol('gis-mountain-peak', 'mountain_peak',
      {
        'text-field': ['format', NAME_FIELD, {}, '\n', {}, ['concat', ['to-string', ['get', 'ele']], 'm'], { 'font-scale': 0.85 }],
        'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.4], 'text-justify': 'center',
      },
      { 'text-color': c('#D99A6C', '#875332'), 'text-halo-width': 1.4 }),
    symbol('gis-aerodrome-label', 'aerodrome_label',
      { 'text-field': NAME_FIELD, 'text-size': 13 },
      { 'text-color': c('#A89ADB', '#66539C'), 'text-halo-width': 1.4 }),
    symbol('gis-place', 'place',
      {
        'text-field': NAME_FIELD,
        'text-size': ['match', ['get', 'class'], 'country', 18, 'city', 15, 'town', 13, 'village', 11, 10],
      },
      { 'text-color': text, 'text-halo-width': 1.4 }),
    symbol('gis-poi', 'poi',
      { 'text-field': NAME_FIELD, 'text-size': 10, 'text-offset': [0, 0.6], 'text-anchor': 'top' },
      { 'text-color': c('#A9B4C2', '#555D68'), 'text-halo-width': 1 }, 14),
    symbol('gis-housenumber', 'housenumber',
      { 'text-field': ['get', 'housenumber'], 'text-size': 9 },
      { 'text-color': c('#9A958A', '#6F6A5F') }, 16),
  ];
}

/** 地形浮雕(raster-dem hillshade),參數同 DPIP */
const TERRAIN_LAYER: LayerSpecification = {
  id: 'terrain-hillshade',
  type: 'hillshade',
  source: 'terrain',
  paint: { 'hillshade-illumination-direction': 335, 'hillshade-exaggeration': 0.3 },
};

/**
 * 產生完整樣式。通知高亮圖層直接烤進樣式裡,切換主題 / 底圖模式時用 `map.setStyle()`
 * 做差異更新即可,不必在執行期重建圖層(只需重新套用 filter / data)。
 */
export function buildMapStyle(dark: boolean, mode: BaseMapMode): StyleSpecification {
  const p = PALETTE[dark ? 'dark' : 'light'];
  const base = (id: string, sourceLayer: string): LayerSpecification =>
    ({ id, type: 'fill', source: 'map', 'source-layer': sourceLayer, paint: { 'fill-color': p.fill } });

  return {
    version: 8,
    glyphs: GLYPHS_URL,
    sources: {
      // 直接給 XYZ 而非 tiles.json:少一次請求,而且署名由這裡決定
      // (tiles.json 內建的 "ExpTech Studio Map" 會蓋掉 source 上的 attribution)
      map: {
        type: 'vector',
        tiles: [BASEMAP_TILE_URL],
        minzoom: 0,
        maxzoom: 12,
        attribution: '<a href="https://exptech.com.tw" target="_blank" rel="noreferrer">ExpTech</a>',
      },
      [NOTIF_POLY_SOURCE]: { type: 'geojson', data: EMPTY_FEATURE_COLLECTION },
      ...(mode === 'terrain'
        ? {
          terrain: {
            type: 'raster-dem' as const,
            tiles: [TERRAIN_TILE_URL],
            encoding: 'mapbox' as const,
            tileSize: 512,
            minzoom: 0,
            maxzoom: 11,
            // 邊界刻意超出 DEM 實際範圍:浮雕在平坦背景上的邊會被看成一條線,
            // 推到使用者平移不到的地方就看不見了
            bounds: [110, 10, 132, 35] as [number, number, number, number],
          },
        }
        : {
          gis: {
            type: 'vector' as const,
            tiles: [GIS_TILE_URL],
            bounds: [114.28579, 10.32677, 122.3283, 26.43722] as [number, number, number, number],
            minzoom: 0,
            maxzoom: 14,
            attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OSM</a>',
          },
        }),
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': p.background } },
      base('land', 'global'),
      base('county', 'city'),
      base('town', 'town'),
      ...(mode === 'terrain' ? [TERRAIN_LAYER] : gisLayers(dark)),
      {
        id: TOWN_OUTLINE_LAYER, type: 'line', source: 'map', 'source-layer': 'town',
        paint: { 'line-color': p.townOutline, 'line-width': 0.4, 'line-opacity': 0.7 },
      },
      {
        id: 'county-outline', type: 'line', source: 'map', 'source-layer': 'city',
        paint: { 'line-color': p.outline, 'line-width': 1 },
      },
      {
        id: NOTIF_LAYERS.codesFill, type: 'fill', source: 'map', 'source-layer': 'town', filter: NO_CODES,
        paint: { 'fill-color': NOTIF_COLORS.codesFill.normal, 'fill-opacity': 0.4 },
      },
      {
        id: NOTIF_LAYERS.codesLine, type: 'line', source: 'map', 'source-layer': 'town', filter: NO_CODES,
        paint: { 'line-color': NOTIF_COLORS.codesLine.normal, 'line-width': 2.5, 'line-opacity': 0.85 },
      },
      {
        id: NOTIF_LAYERS.polyFill, type: 'fill', source: NOTIF_POLY_SOURCE,
        paint: { 'fill-color': NOTIF_COLORS.polyFill.normal, 'fill-opacity': 0.2 },
      },
      {
        id: NOTIF_LAYERS.polyLine, type: 'line', source: NOTIF_POLY_SOURCE,
        paint: { 'line-color': NOTIF_COLORS.polyLine.normal, 'line-width': 2 },
      },
    ],
  };
}
