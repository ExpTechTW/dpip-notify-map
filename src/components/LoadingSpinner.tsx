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
    <div className="flex flex-col items-center gap-5 text-center">
      <div className="relative flex size-16 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary/20 via-primary/5 to-transparent opacity-80" />
        <div className="absolute inset-0 animate-pulse rounded-full bg-primary/10" />
        <Loader2 className={`relative ${SIZE_MAP[size]} animate-spin text-primary`} />
      </div>
      <div className="max-w-xs">
        <p className={`font-semibold tracking-tight ${overlay ? 'text-sm' : 'text-base'}`}>{message}</p>
        {description && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
    </div>
  );

  if (overlay) {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/65 backdrop-blur-md transition-all">
        {content}
      </div>
    );
  }

  return (
    <div className={fullScreen
      ? 'flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/30'
      : 'flex items-center justify-center py-12'
    }>
      {content}
    </div>
  );
}
