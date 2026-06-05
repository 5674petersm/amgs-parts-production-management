import type { Metadata } from "next";

import { Header } from "@/components/Header";

import "./globals.css";

export const metadata: Metadata = {
  title: "AMGS Production",
  description: "Record production from QR scans",
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
