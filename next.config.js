/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "picsum.photos" }],
  },
};

module.exports = nextConfig;
