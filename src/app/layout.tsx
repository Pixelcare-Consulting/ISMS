import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { AppToaster } from "@/components/providers/app-toaster";
import { AuthSessionProvider } from "@/components/providers/session-provider";
import { APP_NAME } from "@/lib/shared/constants";

import "./globals.css";

/** SIL OFL files already in the repo. Loaded locally so Next never calls fonts.googleapis.com. */
const geistSans = localFont({
  src: [
    { path: "../../public/fonts/geist/Geist-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/geist/Geist-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: [
    { path: "../../public/fonts/geist/GeistMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/geist/GeistMono-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description:
    "Finden Technology ISMS — ISO-aligned security management and BRS inventory operations.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
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
