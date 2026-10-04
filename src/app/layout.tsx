import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Fraunces, Kalam, Outfit } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/store";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const kalam = Kalam({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-kalam" });

export const metadata: Metadata = {
  title: "FJEE — JEE Main & Advanced CBT",
  description: "Import a PDF2CBT ZIP, sit a real JEE-style paper, and read a deterministic analysis. Local-first. No login.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${fraunces.variable} ${kalam.variable}`}>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
