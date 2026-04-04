'use client';

import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
  message?: string;
  description?: string;
  overlay?: boolean;
}

const SIZE_MAP = { sm: 'w-5 h-5', md: 'w-7 h-7', lg: 'w-9 h-9' };

export function LoadingSpinner({
  size = 'md', fullScreen = false, message = '載入中...', description, overlay = false
}: LoadingSpinnerProps) {
  const content = (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative flex items-center justify-center w-14 h-14">
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
        <Loader2 className={`${SIZE_MAP[size]} animate-spin text-primary`} />
      </div>
      <div>
        <p className={`font-medium ${overlay ? 'text-sm' : 'text-base'}`}>{message}</p>
        {description && <p className="text-xs text-muted-foreground mt-1.5">{description}</p>}
      </div>
    </div>
  );

  if (overlay) {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-md transition-all">
        {content}
      </div>
    );
  }

  return (
    <div className={fullScreen
      ? 'min-h-screen flex items-center justify-center bg-background'
      : 'flex items-center justify-center py-12'
    }>
      {content}
    </div>
  );
}
