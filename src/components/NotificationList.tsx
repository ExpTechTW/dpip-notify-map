'use client';

import { useEffect, useRef } from 'react';
import { NotificationRecord } from '@/types/notify';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Shield, AlertTriangle } from 'lucide-react';

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

  // 當選中的通知改變時，滾動到該位置
  useEffect(() => {
    if (selectedNotification && selectedItemRef.current && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        const itemElement = selectedItemRef.current;
        const containerRect = scrollContainer.getBoundingClientRect();
        const itemRect = itemElement.getBoundingClientRect();
        
        // 計算需要滾動的距離
        const scrollTop = scrollContainer.scrollTop;
        const itemTop = itemRect.top - containerRect.top + scrollTop;
        const itemBottom = itemTop + itemRect.height;
        const containerHeight = containerRect.height;
        
        // 如果項目不在可視範圍內，滾動到該位置
        if (itemTop < scrollTop || itemBottom > scrollTop + containerHeight) {
          scrollContainer.scrollTo({
            top: itemTop - containerHeight / 2 + itemRect.height / 2,
            behavior: 'smooth'
          });
        }
      }
    }
  }, [selectedNotification]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* 通知列表 */}
      <div className="flex-1 overflow-hidden">
        <ScrollArea ref={scrollAreaRef} className="h-full">
          <div className="p-4 space-y-3">
            {notifications.map((notification, index) => (
            <Card
              key={`${notification.timestamp}-${index}`}
              ref={selectedNotification?.timestamp === notification.timestamp ? selectedItemRef : null}
              className={`relative cursor-pointer transition-all duration-200 ${
                selectedNotification?.timestamp === notification.timestamp
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                  : 'hover:bg-accent/50'
              }`}
              onClick={() => onSelectNotification(notification)}
            >
              <div className="p-3">
                <div className="flex items-start gap-3">
                  <div className={`p-1.5 rounded-md flex-shrink-0 ${
                    notification.critical 
                      ? 'bg-destructive/10' 
                      : 'bg-primary/10'
                  }`}>
                    {notification.critical ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                    ) : (
                      <Shield className="w-3.5 h-3.5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-medium text-foreground text-sm line-clamp-1">
                        {notification.title}
                      </h3>
                      {notification.critical && (
                        <Badge variant="destructive" className="text-xs px-1.5 h-5">
                          緊急
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {notification.body.split('\n').map((line, index) => (
                        <div key={index} className={index > 0 ? 'mt-0.5' : ''}>
                          {line}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <time>
                        {new Date(notification.timestamp).toLocaleString('zh-TW', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </time>
                      {notification.Polygons?.length > 0 && (
                        <span className="text-xs">
                          {notification.Polygons.length} 區域
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </Card>
          ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}