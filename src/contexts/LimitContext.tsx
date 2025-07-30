'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type LimitSetting = 'all' | number;

interface LimitContextType {
  limitSetting: LimitSetting;
  setLimitSetting: (limit: LimitSetting) => void;
}

const LimitContext = createContext<LimitContextType | undefined>(undefined);

export function LimitProvider({ children }: { children: ReactNode }) {
  const [limitSetting, setLimitSetting] = useState<LimitSetting>(1000);

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