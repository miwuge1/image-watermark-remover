import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Image Watermark Remover - 智能去水印",
  description: "使用腾讯云 CI 智能去除图片水印",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
