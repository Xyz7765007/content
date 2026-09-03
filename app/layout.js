import "./tokens.css";
import "./globals.css";
import { DM_Sans, DM_Mono, Playfair_Display } from "next/font/google";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm-sans", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600"], variable: "--font-playfair", display: "swap" });

export const metadata = {
  title: "Content Engine",
  description: "Signal driven content creation powered by AI",
};

// Applies a saved theme choice before first paint so a dark-mode user never
// sees a cream flash. Light is the default; dark is opt-in from Profile.
const themeScript = `try{var t=localStorage.getItem('ce_theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmMono.variable} ${playfair.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
