import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "로컬시티 — 전국 지자체장 비전·슬로건",
  description:
    "전국 광역자치단체장의 이름·소속 정당·슬로건·비전을 한곳에서 조회합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        {children}
      </body>
    </html>
  );
}
