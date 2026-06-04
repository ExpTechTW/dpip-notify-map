'use client';

import { useEffect, useRef } from 'react';
import { NotificationRecord } from '@/types/notify';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, AlertTriangle, Inbox } from 'lucide-react';

interface NotificationListProps {
  notifications: NotificationRecord[];
  selectedNotification: NotificationRecord | null;
  onSelectNotification: (notification: NotificationRecord) => void;
  compactHeader?: boolean;
}

export default function NotificationList({
  notifications,
  selectedNotification,
  onSelectNotification,
  compactHeader = false,
}: NotificationListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedNotification || !selectedItemRef.current || !scrollAreaRef.current) return;
    const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;

    const cRect = viewport.getBoundingClientRect();
    const iRect = selectedItemRef.current.getBoundingClientRect();
    const scrollTop = viewport.scrollTop;
    const itemTop = iRect.top - cRect.top + scrollTop;

    if (itemTop < scrollTop || itemTop + iRect.height > scrollTop + cRect.height) {
      viewport.scrollTo({ top: itemTop - cRect.height / 2 + iRect.height / 2, behavior: 'smooth' });
    }
  }, [selectedNotification]);

  if (notifications.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-muted/80 ring-1 ring-border/50">
          <Inbox className="size-7 text-muted-foreground" />
        </div>
        <p className="text-sm font-semibold text-foreground">沒有通知紀錄</p>
        <p className="mt-1 max-w-[200px] text-xs leading-relaxed text-muted-foreground">試著放寬時間或地區篩選</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-muted/20 px-3 py-2">
        <span className="text-xs font-semibold text-muted-foreground">通知列表</span>
        {(!compactHeader || true) && (
          <span className="text-xs tabular-nums text-muted-foreground/80">{notifications.length} 筆</span>
        )}
      </div>

      <ScrollArea ref={scrollAreaRef} className="h-full min-h-0 min-w-0 flex-1 overflow-hidden [&_[data-slot=scroll-area-viewport]]:min-h-0">
        <div className="space-y-2 p-2 pb-3">
          {notifications.map((notification, index) => {
            const isSelected = selectedNotification?.timestamp === notification.timestamp;
            return (
              <Card
                key={`${notification.timestamp}-${index}`}
                ref={isSelected ? selectedItemRef : null}
                className={`relative cursor-pointer !gap-0 !py-0 transition-all duration-150 ${
                  isSelected
                    ? 'border-primary/45 bg-primary/[0.07] shadow-md ring-2 ring-primary/15'
                    : 'border-border/40 bg-card/50 hover:border-border hover:bg-accent/40 hover:shadow-sm'
                }`}
                onClick={() => onSelectNotification(notification)}
              >
                <div className="p-2.5 sm:p-3">
                  <div className="flex items-start gap-2.5">
                    <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg sm:size-9 sm:rounded-xl ${
                      notification.critical ? 'bg-destructive/12 text-destructive' : 'bg-primary/12 text-primary'
                    }`}>
                      {notification.critical ? <AlertTriangle className="size-4" /> : <Shield className="size-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{notification.title}</h3>
                        {notification.critical && (
                          <Badge variant="destructive" className="h-5 shrink-0 px-1.5 text-[10px] font-semibold">緊急</Badge>
                        )}
                      </div>
                      <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{notification.body.split('\n')[0]}</p>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground/80">
                        <time className="shrink-0">{new Date(notification.timestamp).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                        <div className="flex shrink-0 items-center gap-2">
                          {notification.Polygons?.length > 0 && <span>{notification.Polygons.length} 區域</span>}
                          {(() => {
                            const ios = notification.devices?.ios ?? 0;
                            const android = notification.devices?.android ?? 0;
                            return ios + android > 0
                              ? <span className="tabular-nums" title={`iOS ${ios} / Android ${android}`}>📲 {(ios + android).toLocaleString()}</span>
                              : <span className="opacity-55">無資料</span>;
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
