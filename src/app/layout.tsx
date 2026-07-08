import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "sonner";

import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans"
});

export const metadata: Metadata = {
  title: "Investment Admin Dashboard",
  description: "Admin monitoring dashboard for institution accounts and monthly investment values."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${ibmPlexSans.variable} min-h-screen font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
