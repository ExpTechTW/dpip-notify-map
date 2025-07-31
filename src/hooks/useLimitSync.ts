'use client';

import { useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLimitContext } from '@/contexts/LimitContext';

export function useLimitSync() {
  const { limitSetting, setLimitSetting } = useLimitContext();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 從 URL 同步 limit 設定（只在初始載入時執行一次）
  useEffect(() => {
    const limitParam = searchParams.get('limit');
    if (limitParam) {
      const limitValue = limitParam === 'all' ? 'all' : parseInt(limitParam, 10);
      // 只有當值真的不同時才更新，避免無限循環
      if (limitValue !== limitSetting && !isNaN(limitValue as number)) {
        setLimitSetting(limitValue);
      }
    }
  }, []); // 空依賴數組，只在初始載入時執行

  // 更新 limit 設定並同步 URL
  const updateLimit = useCallback((newLimit: 'all' | number) => {
    // 防止重複設定相同值
    if (newLimit === limitSetting) return;
    
    // 先更新狀態
    setLimitSetting(newLimit);
    
    // 然後更新 URL
    const params = new URLSearchParams(searchParams.toString());
    if (newLimit === 'all') {
      params.set('limit', 'all');
    } else {
      params.set('limit', newLimit.toString());
    }
    
    // 使用 replace 而不是 push 避免歷史記錄污染
    const pathname = window.location.pathname;
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [limitSetting, setLimitSetting, router, searchParams]);

  return {
    limitSetting,
    updateLimit
  };
}