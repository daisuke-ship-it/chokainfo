import type { Metadata } from "next";
import { DM_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@next/third-parties/google";

const dmMono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["300", "400"],
  display: "swap",
});

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.chokainfo.com'
const today = new Date().toISOString().slice(0, 10)
const defaultOgImage = `${BASE_URL}/api/og?area=%E6%9D%B1%E4%BA%AC%E6%B9%BE&date=${today}`

export const metadata: Metadata = {
  verification: {
    google: "VNIi6c0ebmbmK04-MonlQAkK2R-KGMVYn9Po6V2lm14",
  },
  title: "釣果情報.com | 首都圏の船釣り釣果まとめ",
  description:
    "首都圏の船宿釣果情報をリアルタイムで確認。タチウオ・アジ・シーバス・サワラの最新釣果データ。",
  openGraph: {
    title: "釣果情報.com | 首都圏の船釣り釣果まとめ",
    description:
      "首都圏の船宿釣果情報をリアルタイムで確認。タチウオ・アジ・シーバス・サワラの最新釣果データ。",
    siteName: "釣果情報.com",
    type: "website",
    locale: "ja_JP",
    images: [{ url: defaultOgImage, width: 1200, height: 630, alt: "釣果情報.com" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "釣果情報.com | 首都圏の船釣り釣果まとめ",
    description:
      "首都圏の船宿釣果情報をリアルタイムで確認。タチウオ・アジ・シーバス・サワラの最新釣果データ。",
    images: [defaultOgImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1812773737440303"
          crossOrigin="anonymous"
        />
      </head>
      <body className={`${dmMono.variable} antialiased`}>
        {children}
        <BottomNav />
        <Analytics />
        <GoogleAnalytics gaId="G-EVGD6C0LQH" />
      </body>
    </html>
  );
}
