import type { Metadata } from "next";
import { IBM_Plex_Mono, Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/layout/Sidebar";
import { FriendsProvider } from "@/components/providers/FriendsProvider";

const gothic = Zen_Kaku_Gothic_New({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-gothic",
  display: "swap",
});

const mincho = Shippori_Mincho({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-mincho",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-plex",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VRC Social",
  description: "A premium companion app for VRChat",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${gothic.variable} ${mincho.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-[#5b9dff] selection:text-[#0e0e0e]">
        <FriendsProvider>
          <div className="flex min-h-screen relative overflow-hidden">
            <Sidebar />

            <main className="flex-1 min-w-0 ml-0 md:ml-60 relative z-10 px-5 md:px-10 pt-8 md:pt-12 pb-24 md:pb-12">
              <div className="max-w-6xl mx-auto">
                {children}
              </div>
            </main>
          </div>
        </FriendsProvider>
      </body>
    </html>
  );
}
