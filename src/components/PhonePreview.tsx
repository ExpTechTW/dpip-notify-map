'use client';

import { NotificationRecord } from '@/types/notify';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Wifi, Battery, Signal, Camera, Flashlight } from 'lucide-react';
import { getTimeAgo } from '@/lib/time-utils';
import Image from 'next/image';

// 手機殼固定設計尺寸
const PHONE_W = 380;
const PHONE_H = 810;

interface PhonePreviewProps {
  notification: NotificationRecord | null;
}

export default function PhonePreview({ notification }: PhonePreviewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const updateScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { clientWidth: cw, clientHeight: ch } = el;
    const s = Math.min(cw / PHONE_W, ch / PHONE_H, 1);
    setScale(s);
  }, []);

  useEffect(() => {
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateScale]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // iOS 默認背景 - 更真實的漸層
  const iosBackground = `
    radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3) 0%, transparent 50%),
    radial-gradient(circle at 80% 20%, rgba(255, 119, 198, 0.3) 0%, transparent 50%),
    radial-gradient(circle at 40% 80%, rgba(120, 219, 255, 0.4) 0%, transparent 50%),
    linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)
  `;

  return (
    <div ref={containerRef} className="flex h-full w-full min-h-0 items-center justify-center overflow-hidden p-2">
      <div
        className="relative transition-transform duration-300 hover:scale-[1.02]"
        style={{
          width: PHONE_W,
          height: PHONE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* iPhone 14 Pro 外殼 */}
        <div className="relative">
          {/* 外殼陰影 */}
          <div className="absolute inset-0 bg-black rounded-[3.5rem] blur opacity-20 translate-y-4"></div>

          {/* 主體外殼 */}
          <div className="relative w-[380px] h-[810px] bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900 rounded-[3rem] p-[3px] shadow-2xl">
            
            {/* 側邊按鈕 */}
            <div className="absolute -left-[2px] top-[190px] w-[3px] h-[80px] bg-gray-600 rounded-l-full"></div>
            <div className="absolute -left-[2px] top-[280px] w-[3px] h-[60px] bg-gray-600 rounded-l-full"></div>
            <div className="absolute -left-[2px] top-[350px] w-[3px] h-[60px] bg-gray-600 rounded-l-full"></div>
            <div className="absolute -right-[2px] top-[250px] w-[3px] h-[100px] bg-gray-600 rounded-r-full"></div>

            {/* 螢幕邊框 */}
            <div className="w-full h-full bg-black rounded-[3.3rem] p-[1px]">

              {/* 螢幕 */}
              <div className="w-full h-full rounded-[3.2rem] overflow-hidden relative">

                {/* Dynamic Island */}
                <div className="absolute top-[6px] left-1/2 transform -translate-x-1/2 w-[100px] h-[30px] bg-black rounded-full z-50 shadow-inner">
                  <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black rounded-full"></div>
                </div>
                
                {/* 鎖定畫面背景 */}
                <div 
                  className="w-full h-full relative overflow-hidden"
                  style={{ background: iosBackground }}
                >
                  {/* 狀態列 */}
                  <div className="absolute top-[12px] left-0 right-0 flex justify-between items-center px-6 text-white text-xs font-semibold z-40">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono tracking-tight">
                        {currentTime.getHours().toString().padStart(2, '0')}:{currentTime.getMinutes().toString().padStart(2, '0')}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Signal className="w-3.5 h-3.5" />
                      <Wifi className="w-3.5 h-3.5" />
                      <Battery className="w-6 h-3.5" />
                    </div>
                  </div>

                  {/* 時間顯示 */}
                  <div className="absolute top-[100px] left-0 right-0 text-center z-30">
                    <div className="text-white text-8xl font-ultralight tracking-tighter mb-2 drop-shadow-lg" style={{ fontWeight: 100 }}>
                      {currentTime.getHours().toString().padStart(2, '0')}:{currentTime.getMinutes().toString().padStart(2, '0')}
                    </div>
                    <div className="text-white text-xl font-medium tracking-wide drop-shadow-md">
                      {currentTime.toLocaleDateString('zh-TW', { 
                        month: 'long', 
                        day: 'numeric',
                        weekday: 'long'
                      })}
                    </div>
                  </div>

                  {/* 通知區域 */}
                  {notification && (
                    <div className="absolute top-[360px] left-5 right-5 z-20">
                      <div className="bg-white/80 dark:bg-black/65 backdrop-blur-xl rounded-2xl p-4 shadow-2xl">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0 relative w-10 h-10">
                            <Image
                              src="https://raw.githubusercontent.com/ExpTechTW/DPIP-Pocket/refs/heads/main/assets/DPIP.png"
                              alt="DPIP Logo"
                              fill
                              className="rounded-md object-cover"
                              sizes="40px"
                              onClick={() => {
                                window.open('https://github.com/ExpTechTW/DPIP-Pocket', '_blank');
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-1.5">
                              <div className="text-gray-900 dark:text-gray-100 text-sm font-semibold line-clamp-2 flex-1 pr-2">
                                {notification.title}
                              </div>
                              <div className="text-xs font-medium flex-shrink-0">
                                {getTimeAgo(notification.timestamp)}
                              </div>
                            </div>
                            <div className="text-gray-700 dark:text-gray-300 text-xs leading-relaxed max-h-[80px] overflow-hidden">
                              {notification.body.split('\n').map((line, index) => (
                                <div key={index} className={index > 0 ? 'mt-1' : ''}>
                                  {line}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 底部控制區域 */}
                  <div className="absolute bottom-0 left-0 right-0 z-20">
                    <div className="flex justify-between px-14 mb-4">
                      <button className="w-14 h-14 bg-black/50 backdrop-blur-xl rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-95">
                        <Flashlight className="w-6 h-6 text-white/80" />
                      </button>
                      <button className="w-14 h-14 bg-black/50 backdrop-blur-xl rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-95">
                        <Camera className="w-6 h-6 text-white/80" />
                      </button>
                    </div>
                    <div className="text-center">
                      <div className="text-white/70 text-sm mb-2">向上滑動以開啟</div>
                      <div className="flex justify-center">
                        <div className="w-28 h-0.5 bg-white/40 rounded-full mb-2"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}