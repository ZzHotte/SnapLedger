import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { WorkspaceProvider } from "@/lib/workspace-context";
import NavBar from "@/components/NavBar";
import InstallPrompt from "@/components/InstallPrompt";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APPLE_SPLASH_SCREENS: Array<{ file: string; media: string }> = [
  {
    file: "iphone-se",
    media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
  },
  {
    file: "iphone-mini",
    media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)",
  },
  {
    file: "iphone-standard",
    media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
  },
  {
    file: "iphone-plus",
    media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)",
  },
  {
    file: "iphone-pro",
    media: "(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3)",
  },
  {
    file: "iphone-pro-max",
    media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
  },
];

export const metadata: Metadata = {
  title: "SnapLedger - Freight Forwarding CRM",
  description: "Snap a shipping document, get it auto-logged. Track shipments, quotes, and customers, shared with up to 5 teammates.",
  appleWebApp: {
    title: "SnapLedger",
    statusBarStyle: "default",
    startupImage: APPLE_SPLASH_SCREENS.map(({ file, media }) => ({
      url: `/splash/${file}.png`,
      media,
    })),
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <WorkspaceProvider>
            <NavBar />
            {children}
            <InstallPrompt />
          </WorkspaceProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
