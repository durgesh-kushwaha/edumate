import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EduMate",
  description: "Campus ERP with attendance, academics, exams, and payments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const year = new Date().getFullYear();
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <div className="app-shell">
          {children}
          <footer className="site-footer">
            <div className="site-footer-inner">
              <span>EduMate</span>
              <span>{year} Campus ERP Suite</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
