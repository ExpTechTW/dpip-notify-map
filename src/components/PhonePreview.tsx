'use client';

import { NotificationRecord } from '@/types/notify';
import { useState, useEffect } from 'react';
import { Wifi, Battery, Signal, Camera, Flashlight } from 'lucide-react';
import { getTimeAgo } from '@/lib/time-utils';

interface PhonePreviewProps {
  notification: NotificationRecord | null;
}

export default function PhonePreview({ notification }: PhonePreviewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());

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
    <div className="flex items-center justify-center p-4 sm:p-6 lg:p-8 h-full">
      <div className="relative transform hover:scale-[1.02] transition-transform duration-300">
        {/* iPhone 14 Pro 外殼 */}
        <div className="relative">
          {/* 外殼陰影 */}
          <div className="absolute inset-0 bg-black rounded-[2rem] sm:rounded-[3rem] lg:rounded-[3.5rem] blur opacity-20 translate-y-2 sm:translate-y-4"></div>
          
          {/* 主體外殼 - 響應式尺寸 */}
          <div className="relative w-[200px] h-[420px] sm:w-[240px] sm:h-[500px] md:w-[280px] md:h-[600px] lg:w-[320px] lg:h-[690px] bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900 rounded-[1.5rem] sm:rounded-[2rem] md:rounded-[2.5rem] lg:rounded-[3rem] p-[2px] sm:p-[3px] shadow-2xl">
            
            {/* 側邊按鈕 - 響應式 */}
            <div className="absolute -left-[1px] sm:-left-[2px] top-[110px] sm:top-[130px] md:top-[190px] w-[2px] sm:w-[3px] h-[40px] sm:h-[50px] md:h-[80px] bg-gray-600 rounded-l-full"></div>
            <div className="absolute -left-[1px] sm:-left-[2px] top-[160px] sm:top-[190px] md:top-[280px] w-[2px] sm:w-[3px] h-[30px] sm:h-[40px] md:h-[60px] bg-gray-600 rounded-l-full"></div>
            <div className="absolute -left-[1px] sm:-left-[2px] top-[200px] sm:top-[240px] md:top-[350px] w-[2px] sm:w-[3px] h-[30px] sm:h-[40px] md:h-[60px] bg-gray-600 rounded-l-full"></div>
            <div className="absolute -right-[1px] sm:-right-[2px] top-[140px] sm:top-[170px] md:top-[250px] w-[2px] sm:w-[3px] h-[50px] sm:h-[60px] md:h-[100px] bg-gray-600 rounded-r-full"></div>
            
            {/* 螢幕邊框 */}
            <div className="w-full h-full bg-black rounded-[1.7rem] sm:rounded-[1.9rem] md:rounded-[2.9rem] lg:rounded-[3.3rem] p-[1px]">
              
              {/* 螢幕 */}
              <div className="w-full h-full rounded-[1.6rem] sm:rounded-[1.8rem] md:rounded-[2.8rem] lg:rounded-[3.2rem] overflow-hidden relative">
                
                {/* Dynamic Island - 響應式 */}
                <div className="absolute top-[3px] sm:top-[4px] md:top-[5px] lg:top-[6px] left-1/2 transform -translate-x-1/2 w-[60px] sm:w-[75px] md:w-[90px] lg:w-[100px] h-[18px] sm:h-[22px] md:h-[26px] lg:h-[30px] bg-black rounded-full z-50 shadow-inner">
                  <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black rounded-full"></div>
                </div>
                
                {/* 鎖定畫面背景 */}
                <div 
                  className="w-full h-full relative overflow-hidden"
                  style={{ background: iosBackground }}
                >
                  {/* 狀態列 - 響應式 */}
                  <div className="absolute top-[6px] sm:top-[8px] md:top-[10px] lg:top-[12px] left-0 right-0 flex justify-between items-center px-3 sm:px-4 md:px-5 lg:px-6 text-white text-[10px] sm:text-xs font-semibold z-40">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono tracking-tight">
                        {currentTime.getHours().toString().padStart(2, '0')}:{currentTime.getMinutes().toString().padStart(2, '0')}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1 sm:space-x-1.5">
                      <Signal className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <Wifi className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <Battery className="w-5 h-3 sm:w-6 sm:h-3.5" />
                    </div>
                  </div>

                  {/* 時間顯示 - 響應式 */}
                  <div className="absolute top-[50px] sm:top-[65px] md:top-[85px] lg:top-[100px] left-0 right-0 text-center z-30">
                    <div className="text-white text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-ultralight tracking-tighter mb-1 sm:mb-2 drop-shadow-lg" style={{ fontWeight: 100 }}>
                      {currentTime.getHours().toString().padStart(2, '0')}:{currentTime.getMinutes().toString().padStart(2, '0')}
                    </div>
                    <div className="text-white text-sm sm:text-base md:text-lg lg:text-xl font-medium tracking-wide drop-shadow-md">
                      {currentTime.toLocaleDateString('zh-TW', { 
                        month: 'long', 
                        day: 'numeric',
                        weekday: 'long'
                      })}
                    </div>
                  </div>

                  {/* 通知區域 - 只在有通知時顯示，響應式 */}
                  {notification && (
                    <div className="absolute top-[160px] sm:top-[200px] md:top-[260px] lg:top-[320px] left-3 right-3 sm:left-4 sm:right-4 md:left-5 md:right-5 z-20">
                      <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-3 sm:p-4 shadow-2xl">
                        <div className="flex items-start space-x-3">
                          {/* 應用程式圖標 - Apple HIG 20pt 規範 */}
                          <div className="flex-shrink-0 self-start mt-0.5">
                            <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-xl flex items-center justify-center shadow-sm">
                              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                            </div>
                          </div>
                          
                          {/* 通知內容 - 響應式 */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between mb-1">
                              <div className="text-gray-900 text-xs sm:text-sm font-semibold line-clamp-2 flex-1 pr-2">
                                {notification.title}
                              </div>
                              <div className="text-gray-500 text-xs font-medium flex-shrink-0">
                                {getTimeAgo(notification.timestamp)}
                              </div>
                            </div>
                            <div className="text-gray-700 text-xs sm:text-sm line-clamp-2 leading-relaxed">
                              {notification.body}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 底部控制區域 - 響應式 */}
                  <div className="absolute bottom-0 left-0 right-0 z-20">
                    {/* 快捷功能圖標 - 真實 iOS 控制項 */}
                    <div className="flex justify-between px-10 sm:px-12 lg:px-14 mb-8 sm:mb-10 lg:mb-12">
                      <button className="w-12 h-12 sm:w-14 sm:h-14 bg-black/50 backdrop-blur-xl rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-95">
                        <Flashlight className="w-5 h-5 sm:w-6 sm:h-6 text-white/80" />
                      </button>
                      <button className="w-12 h-12 sm:w-14 sm:h-14 bg-black/50 backdrop-blur-xl rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-95">
                        <Camera className="w-5 h-5 sm:w-6 sm:h-6 text-white/80" />
                      </button>
                    </div>
                    
                    {/* 滑動解鎖提示 - 更細緻 */}
                    <div className="text-center mb-6 sm:mb-8 lg:mb-10">
                      <div className="text-white/70 text-xs sm:text-sm mb-2">向上滑動以開啟</div>
                      <div className="flex justify-center">
                        <div className="w-20 sm:w-24 lg:w-28 h-0.5 bg-white/40 rounded-full"></div>
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