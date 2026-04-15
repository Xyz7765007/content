import "./globals.css";

export const metadata = {
  title: "Content Engine",
  description: "Signal driven content creation powered by AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
