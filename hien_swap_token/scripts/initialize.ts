import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { HienSwapToken } from "../target/types/hien_swap_token";
import { createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.HienSwapToken as Program<HienSwapToken>;

  // Lấy Keypair từ ví Provider (cách an toàn)
  const wallet = provider.wallet as anchor.Wallet;
  const payer = wallet.payer;

  console.log(" Mạng:", provider.connection.rpcEndpoint);
  console.log(" Ví:", wallet.publicKey.toBase58());

  // 1. Tạo Token Mint
  const [mintAuthPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("mint_auth")],
    program.programId
  );

  let tokenAMint;
  try {
    console.log("Wait: Đang tạo Token Mint mới...");
    tokenAMint = await createMint(
      provider.connection,
      payer,
      mintAuthPDA,
      null,
      9
    );
    console.log("\n---------------------------------------------------");
    console.log(" TOKEN MINT ADDRESS (Lưu lại ngay):");
    console.log(tokenAMint.toBase58());
    console.log("---------------------------------------------------\n");
  } catch (e) {
    console.error(" Lỗi khi tạo Token:", e);
    return;
  }

  // 2. Khởi tạo Pool
  // Nếu Pool đã tồn tại (do chạy lần trước), bước này sẽ lỗi, 
  // NHƯNG bạn vẫn có Token Mint Address ở trên để dùng cho Frontend.
  try {
    const [poolPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      program.programId
    );
    const [poolTokenVaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("token_a_vault")],
      program.programId
    );
    const [poolAuthorityPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      program.programId
    );

    console.log("Wait: Đang khởi tạo Pool...");
    const tx = await program.methods
      .initializePool(new anchor.BN(1000 * 10 ** 9), new anchor.BN(10))
      .accounts({
        admin: wallet.publicKey,
        pool: poolPDA,
        tokenAMint: tokenAMint,
        programMintAuthority: mintAuthPDA,
        poolTokenAAccount: poolTokenVaultPDA,
        poolAuthority: poolAuthorityPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      }as any) // <-- Bỏ qua lỗi kiểu TypeScript ở đây
      .rpc();
      
    console.log(" Pool khởi tạo thành công! Tx:", tx);
  } catch (e) {
    console.log(" CẢNH BÁO: Không thể khởi tạo Pool mới.");
    console.log("Lý do có thể: Pool đã tồn tại từ lần chạy trước.");
    console.log(" Bạn vẫn có thể dùng TOKEN MINT ADDRESS ở trên nếu bạn vừa tạo nó.");
    console.log("Chi tiết lỗi:", e);
  }
}

main().then(
  () => process.exit(),
  (err) => {
    console.error(err);
    process.exit(-1);
  }
);