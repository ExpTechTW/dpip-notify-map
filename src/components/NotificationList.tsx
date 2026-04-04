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
}

export default function NotificationList({
  notifications,
  selectedNotification,
  onSelectNotification,
}: NotificationListProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedNotification && selectedItemRef.current && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        const itemElement = selectedItemRef.current;
        const containerRect = scrollContainer.getBoundingClientRect();
        const itemRect = itemElement.getBoundingClientRect();
        const scrollTop = scrollContainer.scrollTop;
        const itemTop = itemRect.top - containerRect.top + scrollTop;
        const itemBottom = itemTop + itemRect.height;

        if (itemTop < scrollTop || itemBottom > scrollTop + containerRect.height) {
          scrollContainer.scrollTo({
            top: itemTop - containerRect.height / 2 + itemRect.height / 2,
            behavior: 'smooth'
          });
        }
      }
    }
  }, [selectedNotification]);

  if (notifications.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <Inbox className="w-6 h-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">沒有通知紀錄</p>
        <p className="text-xs text-muted-foreground/60 mt-1">調整篩選條件試試</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <ScrollArea ref={scrollAreaRef} className="h-full">
        <div className="p-2 space-y-1.5">
          {notifications.map((notification, index) => {
            const isSelected = selectedNotification?.timestamp === notification.timestamp;
            return (
              <Card
                key={`${notification.timestamp}-${index}`}
                ref={isSelected ? selectedItemRef : null}
                className={`relative cursor-pointer transition-all duration-150 border ${
                  isSelected
                    ? 'border-primary/50 bg-primary/5 shadow-md shadow-primary/5'
                    : 'border-transparent hover:border-border hover:bg-accent/30'
                }`}
                onClick={() => onSelectNotification(notification)}
              >
                <div className="p-2.5">
                  <div className="flex items-start gap-2.5">
                    <div className={`p-1.5 rounded-lg flex-shrink-0 mt-0.5 ${
                      notification.critical
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-primary/10 text-primary'
                    }`}>
                      {notification.critical
                        ? <AlertTriangle className="w-3.5 h-3.5" />
                        : <Shield className="w-3.5 h-3.5" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1.5 mb-0.5">
                        <h3 className="font-medium text-sm leading-snug line-clamp-1">
                          {notification.title}
                        </h3>
                        {notification.critical && (
                          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                            緊急
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-1.5">
                        {notification.body.split('\n')[0]}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground/70">
                        <time>
                          {new Date(notification.timestamp).toLocaleString('zh-TW', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </time>
                        {notification.Polygons?.length > 0 && (
                          <span>{notification.Polygons.length} 區域</span>
                        )}
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
