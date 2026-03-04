import type { Metadata } from "next";
import { Geist, Geist_Mono, Mulish } from "next/font/google";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const mulish = Mulish({
  variable: "--font-mulish",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Regen Lands — SCORING_V1 Explorer",
  description: "MVP land suitability and carbon potential scorer for regenerative practices",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${mulish.variable} antialiased`}
      >
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
