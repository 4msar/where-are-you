import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Where Are You",
  description: "Share your location in real time. Just send the link!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
