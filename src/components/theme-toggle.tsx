'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => { setMounted(true); }, []);

  return (
    <button
      onClick={() => mounted && setTheme(theme === 'light' ? 'dark' : 'light')}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/80 shadow-sm transition-all hover:border-border hover:bg-accent active:scale-[0.97] sm:size-9',
        className
      )}
      aria-label="切換主題"
    >
      {mounted && theme === 'light'
        ? <Moon className="w-3.5 h-3.5" />
        : <Sun className="w-3.5 h-3.5" />
      }
    </button>
  );
}
