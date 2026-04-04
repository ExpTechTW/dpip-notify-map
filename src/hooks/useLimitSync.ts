'use client';

import { useCallback } from 'react';
import { useLimitContext } from '@/contexts/LimitContext';

export function useLimitSync() {
  const { limitSetting, setLimitSetting } = useLimitContext();

  // 更新 limit 設定並同步 URL
  const updateLimit = useCallback((newLimit: 'all' | number) => {
    // 更新 Context 狀態
    setLimitSetting(newLimit);

    // 用 history.replaceState 更新網址，不觸發 Next.js 導航
    const params = new URLSearchParams(window.location.search);
    params.set('limit', newLimit.toString());
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [setLimitSetting]);

  return {
    limitSetting,
    updateLimit
  };
}