import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GUESS IT | Cyber Arcade",
  description: "Asah Logika & Insting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>
        <div className="grid-overlay"></div>
        <div className="scanlines"></div>
        <div id="screen-flash" className="screen-flash"></div>

        <main className="main-wrapper">
          {children}
        </main>
      </body>
    </html>
  );
}
