import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "VynMesh - VynOps Suite",
  description: "Bring your company data together and ask questions about it in plain English.",
  icons: { icon: "/favicon-circle.png", shortcut: "/favicon-circle.png", apple: "/favicon-circle.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" href="/favicon-circle.png?v=2" type="image/png" />
        <link rel="shortcut icon" href="/favicon-circle.png?v=2" type="image/png" />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
