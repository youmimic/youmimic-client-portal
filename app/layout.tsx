import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SHARE_IMAGE, SITE_NAME, siteUrl } from "@/lib/seo";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

// Site-wide defaults. Public pages override these through pageMetadata()
// in lib/seo.ts; any page without its own title (sign-in, verify email)
// falls back to this one instead of the old "YouMimic Portal".
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: "YouMimic | AI Video Avatars for Business Communication",
  description:
    "Turn one recording into unlimited video content. YouMimic builds photorealistic AI avatars and digital twins that deliver your message in 175+ languages, at scale.",
  applicationName: SITE_NAME,
  // Square PNG versions of the green mark (the source file is portrait, and
  // browsers and Google want square icons). Google asks for a favicon that
  // is a multiple of 48px, so 48, 96, 192 and 512 are all provided.
  icons: {
    icon: [
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    locale: "en_AU",
    images: [SHARE_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE.url] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${montserrat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
