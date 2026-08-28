'use client';

import { useEffect, useRef } from 'react';
import { NotificationRecord } from '@/types/notify';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, AlertTriangle, Inbox } from 'lucide-react';
import { AppleIcon, AndroidIcon } from '@/components/icons/PlatformIcons';

// 共用同一個 Intl formatter(每張卡片各建一個會拖慢長清單)
const TIME_FORMAT = new Intl.DateTimeFormat('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// 只取內文第一行,不必 split 出整個陣列
function firstLine(body: string) {
  const nl = body.indexOf('\n');
  return nl === -1 ? body : body.slice(0, nl);
}

interface NotificationListProps {
  notifications: NotificationRecord[];
  selectedNotification: NotificationRecord | null;
  onSelectNotification: (notification: NotificationRecord) => void;
  /** 地圖運鏡中、選取被節流(切換過快)→ 顯示輕量載入遮罩,提示稍候。不擋點擊(仍合併成最後選取)。 */
  busy?: boolean;
}

export default function NotificationList({
  notifications,
  selectedNotification,
  onSelectNotification,
  busy = false,
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
    <div className="relative flex h-full min-h-0 flex-col">
      {/* 切換過快時的輕量載入遮罩(提示「給地圖時間」)。pointer-events-none → 不擋點擊,
          點擊仍會被合併成最後選取,等運鏡結束套用。 */}
      <div className={`pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-3 transition-opacity duration-200 ${busy ? 'opacity-100' : 'opacity-0'}`} aria-hidden>
        <div className="absolute inset-0 bg-background/30 backdrop-blur-[1.5px]" />
        <div className="relative flex items-center gap-2 rounded-full border border-border/50 bg-card/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
          <span className="size-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary/80" />
          地圖載入中…
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between border-b border-border/50 bg-muted/20 px-3 py-2">
        <span className="text-xs font-semibold text-muted-foreground">通知列表</span>
        <span className="text-xs tabular-nums text-muted-foreground/80">{notifications.length} 筆</span>
      </div>

      <ScrollArea ref={scrollAreaRef} className="h-full min-h-0 min-w-0 flex-1 overflow-hidden [&_[data-slot=scroll-area-viewport]]:min-h-0">
        <div className="space-y-2 p-2 pb-3">
          {notifications.map((notification, index) => {
            const isSelected = selectedNotification?.timestamp === notification.timestamp;
            return (
              <Card
                key={`${notification.timestamp}-${index}`}
                ref={isSelected ? selectedItemRef : null}
                className={`notif-card relative cursor-pointer !gap-0 !py-0 transition-all duration-150 ${
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
                      <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{firstLine(notification.body)}</p>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground/80">
                        <time className="shrink-0">{TIME_FORMAT.format(notification.timestamp)}</time>
                        <div className="flex shrink-0 items-center gap-2">
                          {notification.Polygons?.length > 0 && <span>{notification.Polygons.length} 區域</span>}
                          {(() => {
                            const ios = notification.devices?.ios ?? 0;
                            const android = notification.devices?.android ?? 0;
                            return ios + android > 0
                              ? (
                                <span className="flex items-center gap-2 tabular-nums">
                                  <span className="inline-flex items-center gap-1" title="iOS（APNS）"><AppleIcon className="size-2.5" />{ios.toLocaleString()}</span>
                                  <span className="inline-flex items-center gap-1" title="Android（FCM）"><AndroidIcon className="size-3" />{android.toLocaleString()}</span>
                                </span>
                              )
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
