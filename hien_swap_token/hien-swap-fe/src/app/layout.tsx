// src/app/layout.tsx
"use client";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo } from "react";

// Import CSS mặc định của ví
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Chuyển sang "devnet" hoặc "localhost" tùy môi trường bạn chạy
  // Nếu chạy local validator thì dùng: "http://127.0.0.1:8899"
  const network = WalletAdapterNetwork.Devnet; 
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);
  // const endpoint = "http://127.0.0.1:8899"; // Bỏ comment dòng này nếu test localhost

  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <html lang="en">
      <body>
        <ConnectionProvider endpoint={endpoint}>
          <WalletProvider wallets={wallets} autoConnect>
            <WalletModalProvider>{children}</WalletModalProvider>
          </WalletProvider>
        </ConnectionProvider>
      </body>
    </html>
  );
}