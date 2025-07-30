const fs = require('fs');
const path = require('path');

// 點在多邊形內的檢測
function isPointInPolygon(point, polygon) {
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

// 生成網格矩陣
function generateGridMatrix() {
  console.log('開始生成網格矩陣...');
  
  // 載入鄉鎮資料
  const townData = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/town.json'), 'utf8'));
  
  const gridMatrix = {};
  
  // 台灣的大致邊界 (經緯度)
  const bounds = {
    minLon: 119.5,
    maxLon: 122.5,
    minLat: 21.8,
    maxLat: 25.5
  };
  
  // 網格密度 (數值越小網格越密)
  const gridStep = 0.05; // 約5公里間距，減少計算量
  
  const gridPoints = [];
  
  // 建立網格點
  for (let lon = bounds.minLon; lon <= bounds.maxLon; lon += gridStep) {
    for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += gridStep) {
      const key = `${lon.toFixed(3)},${lat.toFixed(3)}`;
      gridPoints.push({ lon, lat, key });
    }
  }
  
  console.log(`建立了 ${gridPoints.length} 個網格點`);
  
  // 對每個網格點找出所屬鄉鎮
  let processedCount = 0;
  let assignedCount = 0;
  
  for (const point of gridPoints) {
    for (const townFeature of townData.features) {
      const townCoordinates = townFeature.geometry.coordinates;
      const townCode = townFeature.properties.CODE;
      
      if (isPointInPolygon([point.lon, point.lat], townCoordinates)) {
        gridMatrix[point.key] = townCode;
        assignedCount++;
        break; // 找到就停止檢查其他鄉鎮
      }
    }
    
    processedCount++;
    if (processedCount % 1000 === 0) {
      console.log(`已處理 ${processedCount}/${gridPoints.length} 個網格點，已分配 ${assignedCount} 個`);
    }
  }
  
  console.log(`網格矩陣生成完成，包含 ${assignedCount} 個有效網格點`);
  
  // 儲存到文件
  const outputPath = path.join(__dirname, '../public/grid-matrix.json');
  fs.writeFileSync(outputPath, JSON.stringify(gridMatrix, null, 2));
  console.log(`網格矩陣已儲存到 ${outputPath}`);
  
  return gridMatrix;
}

// 執行生成
if (require.main === module) {
  generateGridMatrix();
}

module.exports = { generateGridMatrix };