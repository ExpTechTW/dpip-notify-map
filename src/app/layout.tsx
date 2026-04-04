import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { LimitProvider } from "@/contexts/LimitContext";
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
            <DataProvider>
              {children}
            </DataProvider>
          </LimitProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
