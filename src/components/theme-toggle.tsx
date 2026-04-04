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
      className="w-8 h-8 flex items-center justify-center rounded-lg border border-border/50 bg-background hover:bg-accent transition-colors"
      aria-label="切換主題"
    >
      {mounted && theme === 'light'
        ? <Moon className="w-3.5 h-3.5" />
        : <Sun className="w-3.5 h-3.5" />
      }
    </button>
  );
}
