'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s?: string) => (s ? new Date(s + 'T00:00:00') : null);

interface DatePickerProps {
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({ value, min, max, onChange, placeholder = '年 / 月 / 日', className }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(() => parse(value) ?? parse(max) ?? new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = () => {
    if (!open) setView(parse(value) ?? parse(max) ?? new Date());
    setOpen(!open);
  };

  const minMs = parse(min)?.getTime() ?? -Infinity;
  const maxMs = parse(max)?.getTime() ?? Infinity;

  const year = view.getFullYear();
  const month = view.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={toggle}
        className="flex h-9 w-full min-w-[8rem] items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/90 px-2.5 text-xs font-medium shadow-sm transition hover:border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <span className={value ? 'tabular-nums' : 'text-muted-foreground'}>{value || placeholder}</span>
        <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-64 rounded-xl border border-border/60 bg-background p-2.5 shadow-xl">
          <div className="mb-1.5 flex items-center justify-between">
            <button type="button" onClick={() => setView(new Date(year, month - 1, 1))} className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-xs font-semibold tabular-nums">{year} 年 {month + 1} 月</span>
            <button type="button" onClick={() => setView(new Date(year, month + 1, 1))} className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[10px] font-medium text-muted-foreground/70">
            {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const d = new Date(year, month, day);
              const ms = d.getTime();
              const disabled = ms < minMs || ms > maxMs;
              const isSelected = value === ymd(d);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => { onChange(ymd(d)); setOpen(false); }}
                  className={`flex aspect-square items-center justify-center rounded-md text-xs tabular-nums transition ${
                    isSelected
                      ? 'bg-primary font-semibold text-primary-foreground'
                      : disabled
                        ? 'cursor-not-allowed text-muted-foreground/25'
                        : 'text-foreground hover:bg-accent'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
