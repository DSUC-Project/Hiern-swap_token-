use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer as SplTransfer, MintTo};

// Import các module hệ thống
use anchor_lang::solana_program::system_instruction;
use anchor_lang::solana_program::program::invoke;

// ⚠️ LƯU Ý: Cập nhật ID này bằng ID thực tế của bạn
declare_id!("3rPLwtQ66yRri2QdEKoqEUtwah4PoJ54hGmmzwA4XJhP");

#[program]
pub mod hien_swap_token {
    use super::*;

    // =========================================================================
    // 1. INITIALIZE POOL
    // =========================================================================
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        initial_token_a_amount: u64,
        fixed_rate: u64,
    ) -> Result<()> {
        // A. Setup State
        let pool = &mut ctx.accounts.pool;
        pool.admin = ctx.accounts.admin.key();
        pool.rate = fixed_rate;

        // B. Seeds Setup
        let bump = ctx.bumps.program_mint_authority;
        let seeds = &[b"mint_auth".as_ref(), &[bump]];
        let signer = &[&seeds[..]];

        // C. Mint Token A to Pool Vault
        let cpi_accounts = MintTo {
            mint: ctx.accounts.token_a_mint.to_account_info(),
            to: ctx.accounts.pool_token_a_account.to_account_info(),
            authority: ctx.accounts.program_mint_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();

        token::mint_to(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, signer),
            initial_token_a_amount,
        )?;

        msg!("Pool initialized. Rate: {}", fixed_rate);
        Ok(())
    }

    // =========================================================================
    // 2. SWAP: SOL -> TOKEN A
    // =========================================================================
    pub fn swap_sol_to_token_a(ctx: Context<SwapContext>, amount_in_sol: u64) -> Result<()> {
        // A. Validation
        require!(amount_in_sol > 0, Errors::InvalidAmount);

        let pool = &ctx.accounts.pool;
        // Tính toán amount out: amount_in * rate
        let amount_out_token_a = amount_in_sol.checked_mul(pool.rate).ok_or(Errors::MathOverflow)?;

        // Safety check: Pool có đủ Token không?
        require!(
            ctx.accounts.pool_token_a_account.amount >= amount_out_token_a,
            Errors::InsufficientTokenALiquidity
        );

        // B. Transfer SOL: User -> Pool (System Transfer)
        // User là ví thường, nên dùng System Program transfer là đúng.
        let ix = system_instruction::transfer(
            &ctx.accounts.user.key(),
            &ctx.accounts.pool.key(),
            amount_in_sol,
        );
        
        // Invoke transfer (User ký)
        invoke(
            &ix,
            &[
                ctx.accounts.user.to_account_info(),
                ctx.accounts.pool.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        // C. Transfer Token A: Pool -> User (CPI Transfer)
        let bump = ctx.bumps.pool_authority;
        let seeds = &[b"pool".as_ref(), &[bump]];
        let signer = &[&seeds[..]];

        let cpi_accounts = SplTransfer {
            from: ctx.accounts.pool_token_a_account.to_account_info(),
            to: ctx.accounts.user_token_a_account.to_account_info(),
            authority: ctx.accounts.pool_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();

        token::transfer(
            CpiContext::new_with_signer(cpi_program, cpi_accounts, signer),
            amount_out_token_a,
        )?;

        msg!("Swapped {} SOL for {} Token A", amount_in_sol, amount_out_token_a);
        Ok(())
    }

    // =========================================================================
    // 3. SWAP: TOKEN A -> SOL
    // =========================================================================
    pub fn swap_token_a_to_sol(ctx: Context<SwapContext>, amount_in_token_a: u64) -> Result<()> {
        // A. Validation
        require!(amount_in_token_a > 0, Errors::InvalidAmount);

        let pool = &ctx.accounts.pool;
        // Tính toán amount out: amount_in / rate
        let amount_out_sol = amount_in_token_a.checked_div(pool.rate).ok_or(Errors::MathOverflow)?;

        // B. Transfer Token A: User -> Pool (CPI Transfer)
        let cpi_accounts = SplTransfer {
            from: ctx.accounts.user_token_a_account.to_account_info(),
            to: ctx.accounts.pool_token_a_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();

        token::transfer(
            CpiContext::new(cpi_program, cpi_accounts),
            amount_in_token_a,
        )?;

        // C. Check Pool SOL Liquidity
        let pool_balance = ctx.accounts.pool.to_account_info().lamports();
        require!(pool_balance >= amount_out_sol, Errors::InsufficientSolLiquidity);

        // D. Transfer SOL: Pool -> User (Direct Lamport Modification)
        // [ĐÃ SỬA LỖI Ở ĐÂY]
        // Vì "pool" là PDA do chương trình sở hữu (Owned by Program),
        // System Program không cho phép dùng lệnh "transfer" từ nó đi ra.
        // Thay vào đó, ta trừ/cộng Lamports trực tiếp.

        **ctx.accounts.pool.to_account_info().try_borrow_mut_lamports()? -= amount_out_sol;
        **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += amount_out_sol;

        msg!("Swapped {} Token A for {} SOL", amount_in_token_a, amount_out_sol);
        Ok(())
    }
}

// =========================================================================
// ACCOUNTS & STRUCTS
// =========================================================================

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        seeds = [b"pool"],
        bump,
        payer = admin,
        space = 8 + 32 + 8 // Discriminator + Admin + Rate
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub token_a_mint: Account<'info, Mint>,

    #[account(seeds = [b"mint_auth"], bump)]
    /// CHECK: Seeds check only
    pub program_mint_authority: AccountInfo<'info>,

    #[account(
        init,
        token::mint = token_a_mint,
        token::authority = pool_authority,
        seeds = [b"token_a_vault"],
        bump,
        payer = admin
    )]
    pub pool_token_a_account: Account<'info, TokenAccount>,

    #[account(seeds = [b"pool"], bump)]
    /// CHECK: Seeds check only
    pub pool_authority: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SwapContext<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, seeds = [b"pool"], bump)]
    pub pool: Account<'info, Pool>,

    #[account(seeds = [b"pool"], bump)]
    /// CHECK: Seeds check only
    pub pool_authority: AccountInfo<'info>,

    #[account(mut, seeds = [b"token_a_vault"], bump)]
    pub pool_token_a_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub user_token_a_account: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct Pool {
    pub admin: Pubkey,
    pub rate: u64,
}

#[error_code]
pub enum Errors {
    #[msg("Amount must be greater than 0")]
    InvalidAmount,
    #[msg("Insufficient Token A Liquidity")]
    InsufficientTokenALiquidity,
    #[msg("Insufficient SOL Liquidity")]
    InsufficientSolLiquidity,
    #[msg("Math Overflow")]
    MathOverflow,
}
