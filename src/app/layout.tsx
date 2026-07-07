import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reading Log",
  description: "Log and Share what you are reading",
};

export const viewport: Viewport = {
  themeColor: "#1c1c1e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body className="h-full bg-neutral-900 text-neutral-100 antialiased overscroll-none">
        {children}
      </body>
    </html>
  );
}
