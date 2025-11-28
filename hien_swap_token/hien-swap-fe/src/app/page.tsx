// src/app/page.tsx
"use client";
import { useState, useEffect } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { 
  getAssociatedTokenAddressSync, 
  TOKEN_PROGRAM_ID, 
  createAssociatedTokenAccountInstruction 
} from "@solana/spl-token";
// 👇 HÃY KIỂM TRA LẠI ĐƯỜNG DẪN NÀY (Nếu file utils nằm ở src/utils thì là ../utils/idl.json)
import idl from "../../utils/idl.json"; 

// ================= CẤU HÌNH =================
// Đảm bảo 2 địa chỉ này CHÍNH XÁC
const PROGRAM_ID = new PublicKey("3rPLwtQ66yRri2QdEKoqEUtwah4PoJ54hGmmzwA4XJhP"); 
const TOKEN_MINT_ADDRESS = new PublicKey("2cC12JG6LG2fPwtbnjurRGE8ugLdPKob1yddUVr7DLHK"); 
const RATE = 10; // 1 SOL = 10 Token

export default function Home() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { connected } = useWallet();
  
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  const [amount, setAmount] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("0");
  const [balanceSol, setBalanceSol] = useState(0);
  const [balanceToken, setBalanceToken] = useState(0);
  const [mode, setMode] = useState<"SOL_TO_TOKEN" | "TOKEN_TO_SOL">("SOL_TO_TOKEN");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Tự động tính toán số lượng nhận được
  useEffect(() => {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
        setEstimatedAmount("0");
        return;
    }
    if (mode === "SOL_TO_TOKEN") {
        setEstimatedAmount((val * RATE).toString());
    } else {
        setEstimatedAmount((val / RATE).toString());
    }
  }, [amount, mode]);
  
  // Hàm lấy Program (Đã fix lỗi version Anchor 0.31)
  const getProgram = () => {
    if (!wallet) return null;
    const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: "processed" });

    let idlToUse: any = idl;
    
    // Xử lý lỗi Next.js bọc JSON
    if (idlToUse.default) idlToUse = idlToUse.default;

    // Gán Address thủ công nếu thiếu (Fix cho Anchor 0.31)
    if (!idlToUse.address) idlToUse.address = PROGRAM_ID.toBase58();

    try {
        return new anchor.Program(idlToUse, provider);
    } catch (e) {
        console.error("❌ Lỗi khởi tạo Program:", e);
        setMsg("Lỗi đọc file IDL. Kiểm tra console F12.");
        return null;
    }
  };

  const fetchBalances = async () => {
    if (!wallet || !connected) return;
    try {
      const solBal = await connection.getBalance(wallet.publicKey);
      setBalanceSol(solBal / 1e9);

      const userATA = getAssociatedTokenAddressSync(TOKEN_MINT_ADDRESS, wallet.publicKey);
      try {
        const tokenBal = await connection.getTokenAccountBalance(userATA);
        setBalanceToken(tokenBal.value.uiAmount || 0);
      } catch (e) {
        setBalanceToken(0); 
      }
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (isMounted && connected) { 
        fetchBalances();
        const interval = setInterval(fetchBalances, 5000); 
        return () => clearInterval(interval);
    }
  }, [wallet, connected, isMounted]);

  const handleSwap = async () => {
    if (!wallet || !amount) return;
    const program = getProgram();
    if (!program) return;

    setLoading(true);
    setMsg("Đang xử lý...");

    try {
      const [poolPDA] = PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID);
      const [poolVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from("token_a_vault")], PROGRAM_ID);
      const [poolAuthorityPDA] = PublicKey.findProgramAddressSync([Buffer.from("pool")], PROGRAM_ID);
      const userATA = getAssociatedTokenAddressSync(TOKEN_MINT_ADDRESS, wallet.publicKey);

      // 👇👇👇 FIX LỖI QUAN TRỌNG Ở ĐÂY 👇👇👇
      // 1. Dùng Math.floor để đảm bảo là số nguyên
      // 2. parseFloat(amount) * 1e9 có thể ra số lẻ (vd: 1.1 -> 1100000000.0000002)
      const rawAmount = parseFloat(amount) * 1e9;
      const amountBN = new anchor.BN(Math.floor(rawAmount)); 
      // 👆👆👆

      const userAccountInfo = await connection.getAccountInfo(userATA);
      const preInstructions = [];

      if (!userAccountInfo) {
        console.log("⚠️ User chưa có ví Token, tạo lệnh init...");
        const createATAIx = createAssociatedTokenAccountInstruction(
            wallet.publicKey, userATA, wallet.publicKey, TOKEN_MINT_ADDRESS
        );
        preInstructions.push(createATAIx);
      }

      let tx;
      if (mode === "SOL_TO_TOKEN") {
        tx = await program.methods
          .swapSolToTokenA(amountBN)
          .accounts({
            user: wallet.publicKey,
            pool: poolPDA,
            poolAuthority: poolAuthorityPDA,
            poolTokenAAccount: poolVaultPDA,
            userTokenAAccount: userATA,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .preInstructions(preInstructions)
          .rpc();
      } else {
        if (!userAccountInfo) throw new Error("Bạn chưa có ví Token A!");
        
        tx = await program.methods
          .swapTokenAToSol(amountBN)
          .accounts({
            user: wallet.publicKey,
            pool: poolPDA,
            poolAuthority: poolAuthorityPDA,
            poolTokenAAccount: poolVaultPDA,
            userTokenAAccount: userATA,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
      }

      setMsg(`Thành công! Tx: ${tx.slice(0, 10)}...`);
      setAmount("");
      await fetchBalances(); 
    } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || err.toString();
      if (errorMessage.includes("0xbc4")) {
          setMsg("Lỗi: Ví Token chưa khởi tạo.");
      } else {
          setMsg("Lỗi: " + errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isMounted) return null; 

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 rounded-xl p-6 shadow-2xl border border-gray-700">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold text-blue-400">Swap token</h1>
          <WalletMultiButton className="!bg-blue-600 !h-10" />
        </div>

        {!connected ? (
          <p className="text-center text-gray-400 mt-10">Vui lòng kết nối ví để bắt đầu</p>
        ) : (
          <>
            <div className="flex justify-center mb-6">
                <button 
                    onClick={() => {
                        setMode(mode === "SOL_TO_TOKEN" ? "TOKEN_TO_SOL" : "SOL_TO_TOKEN");
                        setAmount(""); 
                    }}
                    className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded-full hover:bg-gray-600 transition-all border border-gray-600 text-sm font-medium"
                >
                    🔁 {mode === "SOL_TO_TOKEN" ? "SOL → Token A" : "Token A → SOL"}
                </button>
            </div>

            <div className="space-y-2">
              {/* Input */}
              <div className="bg-gray-700 p-4 rounded-xl border border-gray-600">
                <div className="flex justify-between mb-2">
                    <label className="text-xs text-gray-400">Bạn gửi</label>
                    <span className="text-xs text-gray-400">
                        Số dư: {mode === "SOL_TO_TOKEN" ? balanceSol.toFixed(4) : balanceToken.toFixed(2)}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    className="bg-transparent text-2xl font-bold outline-none w-full text-white placeholder-gray-500"
                  />
                  <div className="bg-black/30 px-3 py-1 rounded-lg">
                    <span className="text-sm font-bold text-blue-300">
                        {mode === "SOL_TO_TOKEN" ? "SOL" : "TKA"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center -my-3 relative z-10">
                <div className="bg-gray-800 p-1 rounded-full border border-gray-600">⬇️</div>
              </div>

              {/* Output */}
              <div className="bg-gray-700 p-4 rounded-xl border border-gray-600">
                <div className="flex justify-between mb-2">
                    <label className="text-xs text-gray-400">Bạn nhận (Ước tính)</label>
                    <span className="text-xs text-gray-400">
                        Số dư: {mode === "SOL_TO_TOKEN" ? balanceToken.toFixed(2) : balanceSol.toFixed(4)}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                  <input
                    type="text"
                    value={estimatedAmount}
                    readOnly
                    className="bg-transparent text-2xl font-bold outline-none w-full text-green-400 cursor-default"
                  />
                  <div className="bg-black/30 px-3 py-1 rounded-lg">
                    <span className="text-sm font-bold text-blue-300">
                        {mode === "SOL_TO_TOKEN" ? "TKA" : "SOL"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="px-2 pt-2 text-xs text-gray-400 flex justify-between">
                 <span>Tỷ giá:</span>
                 <span>1 SOL = {RATE} Token A</span>
              </div>

              <button
                onClick={handleSwap}
                disabled={loading || !amount || parseFloat(amount) <= 0}
                className={`w-full py-4 mt-4 rounded-xl font-bold text-lg transition-all ${
                  loading || !amount
                    ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/30 transform hover:scale-[1.02]"
                }`}
              >
                {loading ? "Đang xử lý..." : "Hoán đổi ngay"}
              </button>
            </div>

            {msg && (
              <div className={`mt-4 p-3 rounded-lg text-sm text-center break-all border ${msg.includes("Lỗi") ? "bg-red-900/20 border-red-800 text-red-300" : "bg-green-900/20 border-green-800 text-green-300"}`}>
                {msg}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}