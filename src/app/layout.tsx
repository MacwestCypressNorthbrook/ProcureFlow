import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ProcureFlow — High-trust procurement, end to end",
    template: "%s · ProcureFlow",
  },
  description:
    "Submit requisitions, approve purchase orders, and settle payments in one auditable flow. No email chains, no lost paper trails.",
  metadataBase: new URL("https://procureflow.app"),
  openGraph: {
    title: "ProcureFlow",
    description:
      "High-trust procurement, end to end — requisitions, approvals and payments in one auditable flow.",
    type: "website",
  },
};

// Set the theme class before first paint to avoid a flash of the wrong theme.
const themeInit = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = stored ? stored === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background antialiased`}
      >
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
