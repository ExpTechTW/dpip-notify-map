'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type LimitSetting = 'all' | number;

interface LimitContextType {
  limitSetting: LimitSetting;
  setLimitSetting: (limit: LimitSetting) => void;
}

const LimitContext = createContext<LimitContextType | undefined>(undefined);

export function LimitProvider({ children }: { children: ReactNode }) {
  const [limitSetting, setLimitSetting] = useState<LimitSetting>(100);

  // client 端 mount 後從 URL 同步初始值
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const limitParam = params.get('limit');
    if (!limitParam) return;
    if (limitParam === 'all') {
      setLimitSetting('all');
    } else {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed)) setLimitSetting(parsed);
    }
  }, []);

  return (
    <LimitContext.Provider value={{ limitSetting, setLimitSetting }}>
      {children}
    </LimitContext.Provider>
  );
}

export function useLimitContext() {
  const context = useContext(LimitContext);
  if (context === undefined) {
    throw new Error('useLimitContext must be used within a LimitProvider');
  }
  return context;
}
