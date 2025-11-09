import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shchard - OPN Chain Charting Platform",
  description: "Real-time charting and analytics for OPN Chain tokens",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
