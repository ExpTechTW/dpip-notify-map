import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { LimitProvider } from "@/contexts/LimitContext";
import { TimeFilterProvider } from "@/components/TimeFilter";
import { DataProvider } from "@/contexts/DataContext";

const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-app",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DPIP 通知發送紀錄",
  description: "DPIP 通知發送紀錄與地圖視覺化系統",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" suppressHydrationWarning className={fontSans.variable}>
      <body className={`${fontSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LimitProvider>
            <TimeFilterProvider>
              <DataProvider>
                {children}
              </DataProvider>
            </TimeFilterProvider>
          </LimitProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
