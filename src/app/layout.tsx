import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Astra DB — Data API Playground",
  description:
    "Interactive playground for exploring your Astra DB collections with vector search and AI-powered queries.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark h-full`}>
      <body className="h-full overflow-hidden bg-[#0b0f1a] text-[#f8fafc]">
        {children}
      </body>
    </html>
  );
}
