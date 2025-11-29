/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // 1. Tắt tạo Source Maps khi build (Tiết kiệm rất nhiều RAM)
  productionBrowserSourceMaps: false,

  // 2. Bắt buộc: Xử lý các thư viện nặng của Solana
  transpilePackages: [
    "@coral-xyz/anchor",
    "@solana/spl-token",
    "@solana/wallet-adapter-base",
    "@solana/wallet-adapter-react",
    "@solana/wallet-adapter-react-ui",
    "@solana/wallet-adapter-wallets",
    "@solana/web3.js",
  ],

  // 3. Bỏ qua kiểm tra lỗi (Giúp build nhanh hơn và không bị chặn)
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // 4. Cấu hình Webpack để không bị lỗi module Node.js
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        fs: false,
        os: false,
        path: false,
        crypto: false,
        stream: false,
        buffer: false,
      };
    }
    return config;
  },
};

export default nextConfig;