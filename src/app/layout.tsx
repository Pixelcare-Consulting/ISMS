import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppToaster } from "@/components/providers/app-toaster";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { APP_NAME } from "@/lib/shared/constants";

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
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description:
    "Finden Technology ISMS — ISO-aligned security management and BRS inventory operations.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full w-full antialiased`}
    >
      <body className="min-h-dvh w-full font-sans">
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <AppToaster />
      </body>
    </html>
  );
}
