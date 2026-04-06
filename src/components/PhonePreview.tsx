'use client';

import { NotificationRecord } from '@/types/notify';
import { useState, useEffect, useRef, useCallback } from 'react';
import { getTimeAgo } from '@/lib/time-utils';
import Image from 'next/image';

const PHONE_W = 390;
const PHONE_H = 844;
const SF_FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif';

const SignalIcon = () => (
  <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor">
    <rect x="0" y="9" width="3" height="3" rx=".5" />
    <rect x="4.5" y="6" width="3" height="6" rx=".5" />
    <rect x="9" y="3" width="3" height="9" rx=".5" />
    <rect x="13.5" y="0" width="3" height="12" rx=".5" />
  </svg>
);

const WifiIcon = () => (
  <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 3.5C3.7 1.2 6.2 0 8 0s4.3 1.2 7 3.5" />
    <path d="M3.2 6.2C4.8 4.8 6.3 4 8 4s3.2.8 4.8 2.2" />
    <path d="M5.5 8.8C6.3 8 7.1 7.5 8 7.5s1.7.5 2.5 1.3" />
    <circle cx="8" cy="11" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const BatteryIcon = () => (
  <svg width="27" height="13" viewBox="0 0 27 13" fill="currentColor">
    <rect x="0" y="0" width="23" height="13" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".4" />
    <rect x="1.5" y="1.5" width="20" height="10" rx="1.5" />
    <path d="M24 4.5C25.1 4.5 25.5 5 25.5 6v1c0 1-.4 1.5-1.5 1.5" opacity=".45" />
  </svg>
);

const FlashlightIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 2h6l1 4-1 3v11a2 2 0 01-2 2h-2a2 2 0 01-2-2V9L8 6l1-4z" />
    <circle cx="12" cy="14" r="1.5" fill="currentColor" stroke="none" />
    <line x1="9" y1="6" x2="15" y2="6" />
  </svg>
);

const CameraIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

interface PhonePreviewProps {
  notification: NotificationRecord | null;
}

export default function PhonePreview({ notification }: PhonePreviewProps) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  const updateScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScale(Math.min(el.clientWidth / PHONE_W, el.clientHeight / PHONE_H, 1));
  }, []);

  useEffect(() => {
    updateScale();
    const ro = new ResizeObserver(updateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateScale]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const hh = currentTime.getHours().toString().padStart(2, '0');
  const mm = currentTime.getMinutes().toString().padStart(2, '0');

  return (
    <div ref={containerRef} className="flex h-full w-full min-h-0 items-center justify-center overflow-hidden">
      <div
        className="relative flex-shrink-0"
        style={{
          width: PHONE_W,
          height: PHONE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          opacity: scale === 0 ? 0 : 1,
          transition: 'opacity .2s',
        }}
      >
        {/* 陰影 */}
        <div className="absolute -inset-1 translate-y-3 rounded-[3.5rem] bg-black/20 blur-2xl" />

        {/* 機身 */}
        <div className="absolute inset-0 rounded-[3rem] bg-gradient-to-b from-[#4a4a4e] via-[#2c2c2e] to-[#1c1c1e] p-[2.5px] shadow-[0_8px_40px_rgba(0,0,0,.45)]">
          {/* 側鍵 */}
          <div className="absolute -left-[2.5px] top-[185px] h-8 w-[3px] rounded-l-full bg-[#3a3a3c]" />
          <div className="absolute -left-[2.5px] top-[260px] h-[65px] w-[3px] rounded-l-full bg-[#3a3a3c]" />
          <div className="absolute -left-[2.5px] top-[340px] h-[65px] w-[3px] rounded-l-full bg-[#3a3a3c]" />
          <div className="absolute -right-[2.5px] top-[245px] h-[95px] w-[3px] rounded-r-full bg-[#3a3a3c]" />

          {/* 螢幕 */}
          <div
            className="relative h-full w-full overflow-hidden rounded-[2.75rem] bg-black"
            style={{
              background: `
                radial-gradient(ellipse at 25% 0%, rgba(76,29,149,.4) 0%, transparent 50%),
                radial-gradient(ellipse at 75% 10%, rgba(190,24,93,.25) 0%, transparent 45%),
                radial-gradient(ellipse at 50% 100%, rgba(30,64,175,.3) 0%, transparent 55%),
                linear-gradient(170deg, #0c0c1d 0%, #111827 50%, #0f172a 100%)
              `,
            }}
          >
            {/* Dynamic Island */}
            <div className="absolute left-1/2 top-[11px] z-50 h-[36px] w-[126px] -translate-x-1/2 rounded-[20px] bg-black" />

            {/* 狀態列 */}
            <div className="absolute left-0 right-0 top-[17px] z-40 flex items-center justify-between px-[30px] text-[15px] font-semibold text-white">
              <span className="tabular-nums tracking-tight">{hh}:{mm}</span>
              <div className="flex items-center gap-[6px]">
                <SignalIcon />
                <WifiIcon />
                <BatteryIcon />
              </div>
            </div>

            {/* 時鐘 */}
            <div className="absolute left-0 right-0 top-[76px] z-30 text-center" style={{ fontFamily: SF_FONT }}>
              <div className="phone-clock text-[86px] leading-[.9] tracking-[-0.04em] text-white" style={{ fontWeight: 50 }}>
                {hh}:{mm}
              </div>
              <div className="mt-4 text-[20px] font-normal tracking-wide text-white/85">
                {currentTime.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })}
              </div>
            </div>

            {/* 通知 */}
            {notification && (
              <div key={notification.timestamp} className="absolute left-[14px] right-[14px] top-[290px] z-20 animate-[slideUp_.3s_cubic-bezier(.16,1,.3,1)]">
                <div className="rounded-[22px] bg-white/[.82] p-[13px] shadow-[0_8px_32px_rgba(0,0,0,.12)] backdrop-blur-2xl dark:bg-[#1c1c1e]/[.78] dark:shadow-[0_8px_32px_rgba(0,0,0,.4)]">
                  <div className="flex gap-[10px]">
                    <div
                      className="relative h-[42px] w-[42px] flex-shrink-0 cursor-pointer overflow-hidden rounded-[10px] shadow-sm"
                      onClick={() => window.open('https://github.com/ExpTechTW/DPIP-Pocket', '_blank')}
                    >
                      <Image src="https://raw.githubusercontent.com/ExpTechTW/DPIP-Pocket/refs/heads/main/assets/DPIP.png" alt="DPIP" fill className="object-cover" sizes="42px" />
                    </div>
                    <div className="min-w-0 flex-1 pt-px">
                      <div className="mb-[3px] flex items-start justify-between gap-2">
                        <span className="line-clamp-2 text-[15px] font-semibold leading-[1.25] text-black/90 dark:text-white/95">{notification.title}</span>
                        <span className="mt-px flex-shrink-0 text-[13px] text-black/40 dark:text-white/40">{getTimeAgo(notification.timestamp)}</span>
                      </div>
                      <div className="line-clamp-4 text-[14px] leading-[1.35] text-black/60 dark:text-white/55">
                        {notification.body.split('\n').map((line, i) => (
                          <div key={i} className={i > 0 ? 'mt-[2px]' : ''}>{line}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 底部 */}
            <div className="absolute bottom-0 left-0 right-0 z-20 pb-2">
              <div className="mb-5 flex justify-between px-[46px]">
                <button className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-white/[.08] text-white/80 backdrop-blur-2xl transition hover:bg-white/[.14] active:scale-95">
                  <FlashlightIcon />
                </button>
                <button className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-white/[.08] text-white/80 backdrop-blur-2xl transition hover:bg-white/[.14] active:scale-95">
                  <CameraIcon />
                </button>
              </div>
              <div className="flex justify-center pb-[5px]">
                <div className="h-[5px] w-[135px] rounded-full bg-white/35" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
