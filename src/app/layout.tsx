import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/outfit/wght.css";
import "@fontsource-variable/fraunces/wght.css";
import "@fontsource/kalam/400.css";
import "@fontsource/kalam/700.css";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "FJEE — JEE Main & Advanced CBT",
  description: "Import a PDF2CBT ZIP, sit a real JEE-style paper, and read a deterministic analysis. Local-first. No login.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
