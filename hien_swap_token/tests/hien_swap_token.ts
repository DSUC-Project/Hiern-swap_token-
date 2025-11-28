import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { HienSwapToken } from "../target/types/hien_swap_token";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccount
} from "@solana/spl-token";
import { assert } from "chai";

describe("hien_swap_token", () => {
  // 1. Cấu hình Provider
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.HienSwapToken as Program<HienSwapToken>;

  // 2. Khai báo các biến dùng chung
  let tokenAMint: anchor.web3.PublicKey;
  let user: anchor.web3.Keypair;
  let userTokenAccount: anchor.web3.PublicKey;

  // PDAs
  let poolPDA: anchor.web3.PublicKey;
  let poolAuthorityPDA: anchor.web3.PublicKey;
  let poolTokenVaultPDA: anchor.web3.PublicKey;
  let mintAuthPDA: anchor.web3.PublicKey;

  // Constants
  const INITIAL_MINT_AMOUNT = new anchor.BN(1000 * 10 ** 9); // 1000 Tokens
  const RATE = new anchor.BN(10); // 1 SOL = 10 Token A
  const SWAP_AMOUNT_SOL = new anchor.BN(1 * 10 ** 9); // 1 SOL

  it("Setup: Prepare Mint and PDAs", async () => {
    // Tạo user mới để test swap
    user = anchor.web3.Keypair.generate();

    // Airdrop SOL cho user để có phí giao dịch và swap
    const signature = await provider.connection.requestAirdrop(user.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(signature);

    // Tính toán các địa chỉ PDA (Program Derived Addresses)
    // Lưu ý: Trong contract, pool và pool_authority dùng chung seed "pool", nên địa chỉ sẽ giống nhau.
    [poolPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      program.programId
    );

    [poolAuthorityPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("pool")],
      program.programId
    );

    [mintAuthPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint_auth")],
      program.programId
    );

    [poolTokenVaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("token_a_vault")],
      program.programId
    );

    console.log("Pool PDA:", poolPDA.toBase58());
    console.log("Mint Auth PDA:", mintAuthPDA.toBase58());

    // Tạo Token Mint mới
    // Quyền mint (Freeze/Mint Authority) sẽ được set cho mintAuthPDA của smart contract
    // để contract có thể mint token vào pool khi initialize.
    tokenAMint = await createMint(
      provider.connection,
      (provider.wallet as anchor.Wallet).payer, // Payer
      mintAuthPDA, // Mint Authority (Giao cho Smart Contract)
      null, // Freeze Authority
      9 // Decimals
    );
  });

  it("Is initialized!", async () => {
    // Gọi hàm initialize_pool
    const tx = await program.methods
      .initializePool(INITIAL_MINT_AMOUNT, RATE)
      .accounts({
        admin: provider.wallet.publicKey,
        pool: poolPDA,
        tokenAMint: tokenAMint,
        programMintAuthority: mintAuthPDA,
        poolTokenAAccount: poolTokenVaultPDA,
        poolAuthority: poolAuthorityPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    console.log("Initialize transaction signature", tx);

    // Verify: Kiểm tra Pool state
    const poolAccount = await program.account.pool.fetch(poolPDA);
    assert.ok(poolAccount.rate.eq(RATE));
    assert.ok(poolAccount.admin.equals(provider.wallet.publicKey));

    // Verify: Kiểm tra xem Vault đã nhận được token chưa
    const vaultAccount = await getAccount(provider.connection, poolTokenVaultPDA);
    assert.equal(vaultAccount.amount.toString(), INITIAL_MINT_AMOUNT.toString());
  });

  it("Swaps SOL to Token A", async () => {
    // Tạo ví Token A cho User
    userTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      user,
      tokenAMint,
      user.publicKey
    );

    // Lấy balance Token A của user trước khi swap (nên là 0)
    let userTokenBefore = await getAccount(provider.connection, userTokenAccount);
    assert.equal(userTokenBefore.amount.toString(), "0");

    // Thực hiện Swap
    const tx = await program.methods
      .swapSolToTokenA(SWAP_AMOUNT_SOL)
      .accounts({
        user: user.publicKey,
        pool: poolPDA,
        poolAuthority: poolAuthorityPDA,
        poolTokenAAccount: poolTokenVaultPDA,
        userTokenAAccount: userTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user]) // User phải ký để gửi SOL
      .rpc();

    console.log("Swap SOL -> Token A tx:", tx);

    // Verify: User nhận được Token A?
    // Amount Out = 1 SOL * 10 Rate = 10 Token
    const expectedTokenAmount = SWAP_AMOUNT_SOL.mul(RATE);
    
    let userTokenAfter = await getAccount(provider.connection, userTokenAccount);
    assert.equal(userTokenAfter.amount.toString(), expectedTokenAmount.toString());

    // Verify: Pool nhận được SOL?
    const poolSolBalance = await provider.connection.getBalance(poolPDA);
    // Lưu ý: Pool PDA cần SOL để làm rent-exempt khi init, nên balance > swap_amount
    assert.isAtLeast(poolSolBalance, SWAP_AMOUNT_SOL.toNumber());
  });

  it("Swaps Token A to SOL", async () => {
    // User đang có 10 Token A (từ test trên).
    // Swap ngược lại 5 Token A -> SOL.
    const swapAmountToken = new anchor.BN(0.5 * 10 ** 9 * 10); // 5 Token A (Logic decimal hơi lạ tí vì rate, cứ tính theo u64)
    // Cụ thể: Test trước user có 10 * 10^9 đơn vị. Giờ swap 5 * 10^9 đơn vị.
    
    const amountToSwapBack = SWAP_AMOUNT_SOL.mul(RATE).div(new anchor.BN(2)); // Swap 1 nửa số token đang có

    const preUserSol = await provider.connection.getBalance(user.publicKey);

    const tx = await program.methods
      .swapTokenAToSol(amountToSwapBack)
      .accounts({
        user: user.publicKey,
        pool: poolPDA,
        poolAuthority: poolAuthorityPDA,
        poolTokenAAccount: poolTokenVaultPDA,
        userTokenAAccount: userTokenAccount,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    console.log("Swap Token A -> SOL tx:", tx);

    // Verify: Token của user bị trừ
    let userTokenAfter = await getAccount(provider.connection, userTokenAccount);
    const expectedRemaining = SWAP_AMOUNT_SOL.mul(RATE).sub(amountToSwapBack);
    assert.equal(userTokenAfter.amount.toString(), expectedRemaining.toString());

    // Verify: SOL của user tăng lên
    // Lưu ý: User mất một ít phí gas cho transaction, nên balance sẽ xấp xỉ mức mong đợi
    const postUserSol = await provider.connection.getBalance(user.publicKey);
    assert.isTrue(postUserSol > preUserSol); 
  });
});