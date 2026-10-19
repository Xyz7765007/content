import "./globals.css";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Newsreader } from "next/font/google";
import MotionRoot from "../components/MotionRoot";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.huesy.app";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Huesy: hear about the launch the day it breaks",
    template: "%s · Huesy",
  },
  applicationName: "Huesy",
  description:
    "Huesy checks Google News, Instagram and X for brand launches, collabs and campaigns, then drafts the post in your brand voice.",
  openGraph: {
    title: "Huesy: stop finding out from other people's posts",
    description:
      "Huesy checks Google News, Instagram and X for brand launches, collabs and campaigns, then drafts the post in your brand voice.",
    siteName: "Huesy",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcf5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
};

// Light or dark as chosen in the Appearance switch (components/ThemeSwitch),
// otherwise the system appearance. Set before first paint so the cream canvas
// never flashes on a dark load, and eased when the system switches.
const themeBoot = `(function(){var d=document.documentElement;var q=window.matchMedia("(prefers-color-scheme: dark)");function c(){try{var v=localStorage.getItem("huesy:theme");return v==="light"||v==="dark"?v:null}catch(e){return null}}function s(){d.setAttribute("data-theme",c()||(q.matches?"dark":"light"))}s();var f=c();if(f){document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",f==="dark"?"#141414":"#fcf5ef")})})}try{q.addEventListener("change",function(){if(c())return;d.classList.add("theme-easing");s();setTimeout(function(){d.classList.remove("theme-easing")},400)})}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${GeistSans.variable} ${GeistMono.variable} ${newsreader.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <MotionRoot>{children}</MotionRoot>
      </body>
    </html>
  );
}
