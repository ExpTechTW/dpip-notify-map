'use client';

import { useCallback } from 'react';
import { useLimitContext } from '@/contexts/LimitContext';

export function useLimitSync() {
  const { limitSetting, setLimitSetting } = useLimitContext();

  const updateLimit = useCallback((newLimit: 'all' | number) => {
    setLimitSetting(newLimit);
    const params = new URLSearchParams(window.location.search);
    params.set('limit', newLimit.toString());
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [setLimitSetting]);

  return {
    limitSetting,
    updateLimit
  };
}