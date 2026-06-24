import type { Metadata } from "next";

import { Header } from "@/components/Header";
import { AMGS_LOGO_URL } from "@/constants/branding";

import "./globals.css";

export const metadata: Metadata = {
  title: "AMGS Production Management System",
  description: "Record production from QR scans",
  icons: {
    icon: AMGS_LOGO_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <main>
          <Header />
          {children}
        </main>
      </body>
    </html>
  );
}
