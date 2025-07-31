/**
 * 處理路徑導航，確保 basePath 不會重複
 * 在生產環境中，Next.js 設定了 basePath: "/history"
 * 使用此函數來避免路徑重複問題
 */
export function getPath(path: string): string {
  // 如果路徑不是以 / 開頭，直接返回
  if (!path.startsWith('/')) {
    return path;
  }
  
  // 在生產環境中，移除開頭的 /，讓 Next.js 自動處理 basePath
  // 這樣可以避免 /history/history 的問題
  if (process.env.NODE_ENV === 'production') {
    return path.substring(1);
  }
  
  return path;
}