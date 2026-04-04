'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => { setMounted(true); }, []);

  return (
    <button
      onClick={() => mounted && setTheme(theme === 'light' ? 'dark' : 'light')}
      className="h-9 w-9 flex items-center justify-center rounded-xl border border-border/60 bg-background/80 shadow-sm hover:bg-accent hover:border-border transition-all active:scale-[0.97]"
      aria-label="切換主題"
    >
      {mounted && theme === 'light'
        ? <Moon className="w-3.5 h-3.5" />
        : <Sun className="w-3.5 h-3.5" />
      }
    </button>
  );
}
