import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { AuthProvider } from "@/components/AuthProvider";

import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "beFORE, surf intelligence for the Lisbon coast",
  description:
    "See which beach is worth it right now. Hourly surf scores for the Lisbon, Ericeira and Cascais coast, computed from open forecast data.",
  icons: { icon: "/before_logo_radar.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jakarta.variable} h-full`}>
      <body className="h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
