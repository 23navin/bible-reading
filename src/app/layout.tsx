import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScriptureShare",
  description: "Share what you're reading with your group.",
};

export const viewport: Viewport = {
  themeColor: "#f5f5f4",
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
    <html lang="en" className="h-full">
      <body className="h-full bg-stone-100 text-stone-900 antialiased overscroll-none">
        {children}
      </body>
    </html>
  );
}
