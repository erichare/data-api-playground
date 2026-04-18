import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Data API Playground",
  description:
    "Interactive playground for exploring your Data API collections with vector search and AI-powered queries.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // default to dark; client JS will toggle the class based on user preference
    <html lang="en" className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} dark h-full`}>
      <body className="h-full overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
