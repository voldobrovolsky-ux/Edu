import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PayrollModuleNav } from "@/components/PayrollModuleNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Бухгалтерия — EDUMED",
  description: "Учёт выплат, кадры и расчёты",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <main className="mx-auto w-full max-w-none flex-1 px-4 py-6 pb-12 lg:px-10 xl:px-12">
          <PayrollModuleNav />
          {children}
        </main>
      </body>
    </html>
  );
}
