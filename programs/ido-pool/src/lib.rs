//! An IDO pool program implementing the Mango Markets token sale design here:
//! https://docs.mango.markets/litepaper#token-sale.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, Burn, Mint, MintTo, TokenAccount, Transfer};
use std::str::FromStr;

// Update this with the address you want to be able to deploy pools
const ALLOWED_DEPLOYER: &str = "9urEjHV3Wm4Pv4Da8uuufRoAuLT9FNAm97wHy3qF9pYy";

#[program]
pub mod ido_pool {
    use super::*;

    #[access_control(InitializePool::accounts(&ctx, nonce) future_start_time(&ctx, start_ido_ts))]
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        num_ido_tokens: String,
        nonce: u8,
        start_ido_ts: i64,
        end_deposits_ts: i64,
        end_ido_ts: i64,
        withdraw_melon_ts: i64,
    ) -> Result<()> {
        let num_ido_tokens_u64 = num_ido_tokens.parse::<u64>().unwrap();

        // msg!("Number of IDO Tokens {:?}", num_ido_tokens_u64);
        if !(start_ido_ts < end_deposits_ts
            && end_deposits_ts <= end_ido_ts
            && end_ido_ts <= withdraw_melon_ts)
        {
            return Err(ErrorCode::SeqTimes.into());
        }
        if num_ido_tokens_u64 == 0 {
            return Err(ErrorCode::InvalidParam.into());
        }

        let pool_account = &mut ctx.accounts.pool_account;
        if Pubkey::from_str(ALLOWED_DEPLOYER).unwrap() != *ctx.accounts.payer.to_account_info().key
        {
            return Err(ErrorCode::InvalidParam.into());
        }
        pool_account.redeemable_mint = *ctx.accounts.redeemable_mint.to_account_info().key;
        pool_account.pool_watermelon = *ctx.accounts.pool_watermelon.to_account_info().key;
        pool_account.watermelon_mint = ctx.accounts.pool_watermelon.mint;
        pool_account.pool_usdc = *ctx.accounts.pool_usdc.to_account_info().key;
        pool_account.distribution_authority = *ctx.accounts.distribution_authority.key;
        pool_account.nonce = nonce;
        pool_account.num_ido_tokens = num_ido_tokens_u64;
        pool_account.start_ido_ts = start_ido_ts;
        pool_account.end_deposits_ts = end_deposits_ts;
        pool_account.end_ido_ts = end_ido_ts;
        pool_account.withdraw_melon_ts = withdraw_melon_ts;

        // Transfer Watermelon from creator to pool account.
        let cpi_accounts = Transfer {
            from: ctx.accounts.creator_watermelon.to_account_info(),
            to: ctx.accounts.pool_watermelon.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, num_ido_tokens_u64)?;

        Ok(())
    }

    pub fn modify_ido_time(
        ctx: Context<ModifyIdoTime>,
        start_ido_ts: i64,
        end_deposits_ts: i64,
        end_ido_ts: i64,
        withdraw_melon_ts: i64,
    ) -> Result<()> {
        if !(start_ido_ts < end_deposits_ts
            && end_deposits_ts < end_ido_ts
            && end_ido_ts < withdraw_melon_ts)
        {
            return Err(ErrorCode::SeqTimes.into());
        }
        if Pubkey::from_str(ALLOWED_DEPLOYER).unwrap() != *ctx.accounts.payer.to_account_info().key
        {
            return Err(ErrorCode::InvalidParam.into());
        }
        let pool_account = &mut ctx.accounts.pool_account;
        pool_account.start_ido_ts = start_ido_ts;
        pool_account.end_deposits_ts = end_deposits_ts;
        pool_account.end_ido_ts = end_ido_ts;
        pool_account.withdraw_melon_ts = withdraw_melon_ts;
        Ok(())
    }

    #[access_control(unrestricted_phase(&ctx))]
    pub fn exchange_usdc_for_redeemable(
        ctx: Context<ExchangeUsdcForRedeemable>,
        amount: u64,
    ) -> Result<()> {
        if amount == 0 {
            return Err(ErrorCode::InvalidParam.into());
        }
        // While token::transfer will check this, we prefer a verbose err msg.
        if ctx.accounts.user_usdc.amount < amount {
            return Err(ErrorCode::LowUsdc.into());
        }

        // Transfer user's USDC to pool USDC account.
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_usdc.to_account_info(),
            to: ctx.accounts.pool_usdc.to_account_info(),
            authority: ctx.accounts.user_authority.clone(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Mint Redeemable to user Redeemable account.
        let seeds = &[
            ctx.accounts.pool_account.watermelon_mint.as_ref(),
            &[ctx.accounts.pool_account.nonce],
        ];
        let signer = &[&seeds[..]];
        let cpi_accounts = MintTo {
            mint: ctx.accounts.redeemable_mint.to_account_info(),
            to: ctx.accounts.user_redeemable.to_account_info(),
            authority: ctx.accounts.pool_signer.clone(),
        };
        let cpi_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::mint_to(cpi_ctx, amount)?;

        Ok(())
    }

    #[access_control(withdraw_only_phase(&ctx))]
    pub fn exchange_redeemable_for_usdc(
        ctx: Context<ExchangeRedeemableForUsdc>,
        amount: u64,
    ) -> Result<()> {
        return Err(ErrorCode::UsdcWithdrawNotAllowed.into());
        // if amount == 0 {
        //     return Err(ErrorCode::InvalidParam.into());
        // }
        // // While token::burn will check this, we prefer a verbose err msg.
        // if ctx.accounts.user_redeemable.amount < amount {
        //     return Err(ErrorCode::LowRedeemable.into());
        // }

        // // Burn the user's redeemable tokens.
        // let cpi_accounts = Burn {
        //     mint: ctx.accounts.redeemable_mint.to_account_info(),
        //     to: ctx.accounts.user_redeemable.to_account_info(),
        //     authority: ctx.accounts.user_authority.to_account_info(),
        // };
        // let cpi_program = ctx.accounts.token_program.clone();
        // let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        // token::burn(cpi_ctx, amount)?;

        // // Transfer USDC from pool account to user.
        // let seeds = &[
        //     ctx.accounts.pool_account.watermelon_mint.as_ref(),
        //     &[ctx.accounts.pool_account.nonce],
        // ];
        // let signer = &[&seeds[..]];
        // let cpi_accounts = Transfer {
        //     from: ctx.accounts.pool_usdc.to_account_info(),
        //     to: ctx.accounts.user_usdc.to_account_info(),
        //     authority: ctx.accounts.pool_signer.to_account_info(),
        // };
        // let cpi_program = ctx.accounts.token_program.clone();
        // let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        // token::transfer(cpi_ctx, amount)?;

        // Ok(())
    }

    #[access_control(ido_over(&ctx.accounts.pool_account, &ctx.accounts.clock))]
    pub fn exchange_redeemable_for_watermelon(
        ctx: Context<ExchangeRedeemableForWatermelon>,
        amount: u64,
    ) -> Result<()> {
        // msg!("Ammount passed in: {:?}", amount);
        if amount == 0 {
            return Err(ErrorCode::InvalidParam.into());
        }
        // While token::burn will check this, we prefer a verbose err msg.
        if ctx.accounts.user_redeemable.amount < amount {
            return Err(ErrorCode::LowRedeemable.into());
        }
        // msg!(
        //     "pool_watermelon.amount: {:?}",
        //     ctx.accounts.pool_watermelon.amount
        // );
        // msg!(
        //     "redeemable_mint.supply: {:?}",
        //     ctx.accounts.redeemable_mint.supply
        // );
        let real_pool_supply = ctx.accounts.pool_watermelon.amount;
        let real_redeemable_supply = ctx.accounts.redeemable_mint.supply * u64::pow(10, 3);
        // msg!("real_pool_supply: {:?}", real_pool_supply);
        // msg!("real_redeemable_supply: {:?}", real_redeemable_supply);
        let token_price: f64 =
            (real_redeemable_supply as f64 / real_pool_supply as f64) * f64::powf(10.0, 9.0);
        // The token multiple will be token price / 0.50;
        // If token multiple is >= 1, then we don't have to distribute a fraction of the tokens
        let floor_price = 0.50 * f64::powf(10.0, 9.0);
        // msg!("floor_price: {:?}", floor_price);
        let token_multiple = token_price / floor_price;
        // msg!("token_multiple: {:?}", token_multiple);
        // msg!("token_price: {:?}", token_price);
        // Calculate watermelon tokens due.
        let mut watermelon_amount = (amount as u128)
            .checked_mul(ctx.accounts.pool_watermelon.amount as u128)
            .unwrap()
            .checked_div(ctx.accounts.redeemable_mint.supply as u128)
            .unwrap();
        let mut _new_watermelon_amount: u128 = 0;
        // msg!("watermelon_amount: {:?}", watermelon_amount);
        // msg!("token_price < 0.50: {:?}", token_price < 0.50);
        if token_price < floor_price {
            // msg!("token_price is less than 0.50000000, should not distribute all tokens");
            watermelon_amount = ((watermelon_amount as f64) * token_multiple) as u128;
            // msg!("new watermelon_amount: {:?}", watermelon_amount);
        }

        // Burn the user's redeemable tokens.
        let cpi_accounts = Burn {
            mint: ctx.accounts.redeemable_mint.to_account_info(),
            to: ctx.accounts.user_redeemable.to_account_info(),
            authority: ctx.accounts.user_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::burn(cpi_ctx, amount)?;

        // Transfer Watermelon from pool account to user.
        let seeds = &[
            ctx.accounts.pool_account.watermelon_mint.as_ref(),
            &[ctx.accounts.pool_account.nonce],
        ];
        let signer = &[&seeds[..]];
        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_watermelon.to_account_info(),
            to: ctx.accounts.user_watermelon.to_account_info(),
            authority: ctx.accounts.pool_signer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, watermelon_amount as u64)?;

        Ok(())
    }

    #[access_control(ido_over(&ctx.accounts.pool_account, &ctx.accounts.clock))]
    pub fn withdraw_pool_usdc(ctx: Context<WithdrawPoolUsdc>, amount: u64) -> Result<()> {
        if Pubkey::from_str(ALLOWED_DEPLOYER).unwrap() != *ctx.accounts.payer.to_account_info().key
        {
            return Err(ErrorCode::InvalidParam.into());
        }
        // Transfer total USDC from pool account to creator account.
        let seeds = &[
            ctx.accounts.pool_account.watermelon_mint.as_ref(),
            &[ctx.accounts.pool_account.nonce],
        ];
        let signer = &[&seeds[..]];
        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_usdc.to_account_info(),
            to: ctx.accounts.creator_usdc.to_account_info(),
            authority: ctx.accounts.pool_signer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }

    #[access_control(ido_over(&ctx.accounts.pool_account, &ctx.accounts.clock))]
    pub fn withdraw_pool_watermelon(
        ctx: Context<WithdrawPoolWatermelon>,
        amount: u64,
    ) -> Result<()> {
        if Pubkey::from_str(ALLOWED_DEPLOYER).unwrap() != *ctx.accounts.payer.to_account_info().key
        {
            return Err(ErrorCode::InvalidParam.into());
        }

        // Transfer total watermelon from pool account to creator account.
        let seeds = &[
            ctx.accounts.pool_account.watermelon_mint.as_ref(),
            &[ctx.accounts.pool_account.nonce],
        ];
        let signer = &[&seeds[..]];
        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_watermelon.to_account_info(),
            to: ctx.accounts.creator_watermelon.to_account_info(),
            authority: ctx.accounts.pool_signer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.clone();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(init)]
    pub pool_account: ProgramAccount<'info, PoolAccount>,
    pub pool_signer: AccountInfo<'info>,
    #[account(
        constraint = redeemable_mint.mint_authority == COption::Some(*pool_signer.key),
        constraint = redeemable_mint.supply == 0
    )]
    pub redeemable_mint: CpiAccount<'info, Mint>,
    #[account(constraint = usdc_mint.decimals == redeemable_mint.decimals)]
    pub usdc_mint: CpiAccount<'info, Mint>,
    #[account(constraint = pool_watermelon.mint == *watermelon_mint.to_account_info().key)]
    pub watermelon_mint: CpiAccount<'info, Mint>,
    #[account(mut, constraint = pool_watermelon.owner == *pool_signer.key)]
    pub pool_watermelon: CpiAccount<'info, TokenAccount>,
    #[account(constraint = pool_usdc.owner == *pool_signer.key)]
    pub pool_usdc: CpiAccount<'info, TokenAccount>,
    #[account(signer, constraint =  watermelon_mint.mint_authority == COption::Some(*distribution_authority.key))]
    pub distribution_authority: AccountInfo<'info>,
    #[account(signer)]
    pub payer: AccountInfo<'info>,
    #[account(mut)]
    pub creator_watermelon: CpiAccount<'info, TokenAccount>,
    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}

impl<'info> InitializePool<'info> {
    fn accounts(ctx: &Context<InitializePool<'info>>, nonce: u8) -> Result<()> {
        let expected_signer = Pubkey::create_program_address(
            &[ctx.accounts.pool_watermelon.mint.as_ref(), &[nonce]],
            ctx.program_id,
        )
        .map_err(|_| ErrorCode::InvalidNonce)?;
        if ctx.accounts.pool_signer.key != &expected_signer {
            return Err(ErrorCode::InvalidNonce.into());
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ExchangeUsdcForRedeemable<'info> {
    #[account(has_one = redeemable_mint, has_one = pool_usdc)]
    pub pool_account: ProgramAccount<'info, PoolAccount>,
    #[account(seeds = [pool_account.watermelon_mint.as_ref(), &[pool_account.nonce]])]
    pool_signer: AccountInfo<'info>,
    #[account(
        mut,
        constraint = redeemable_mint.mint_authority == COption::Some(*pool_signer.key)
    )]
    pub redeemable_mint: CpiAccount<'info, Mint>,
    #[account(mut, constraint = pool_usdc.owner == *pool_signer.key)]
    pub pool_usdc: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    pub user_authority: AccountInfo<'info>,
    #[account(mut, constraint = user_usdc.owner == *user_authority.key)]
    pub user_usdc: CpiAccount<'info, TokenAccount>,
    #[account(mut, constraint = user_redeemable.owner == *user_authority.key)]
    pub user_redeemable: CpiAccount<'info, TokenAccount>,
    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct ExchangeRedeemableForUsdc<'info> {
    #[account(has_one = redeemable_mint, has_one = pool_usdc)]
    pub pool_account: ProgramAccount<'info, PoolAccount>,
    #[account(seeds = [pool_account.watermelon_mint.as_ref(), &[pool_account.nonce]])]
    pool_signer: AccountInfo<'info>,
    #[account(
        mut,
        constraint = redeemable_mint.mint_authority == COption::Some(*pool_signer.key)
    )]
    pub redeemable_mint: CpiAccount<'info, Mint>,
    #[account(mut, constraint = pool_usdc.owner == *pool_signer.key)]
    pub pool_usdc: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    pub user_authority: AccountInfo<'info>,
    #[account(mut, constraint = user_usdc.owner == *user_authority.key)]
    pub user_usdc: CpiAccount<'info, TokenAccount>,
    #[account(mut, constraint = user_redeemable.owner == *user_authority.key)]
    pub user_redeemable: CpiAccount<'info, TokenAccount>,
    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct ExchangeRedeemableForWatermelon<'info> {
    #[account(has_one = redeemable_mint, has_one = pool_watermelon)]
    pub pool_account: ProgramAccount<'info, PoolAccount>,
    #[account(seeds = [pool_account.watermelon_mint.as_ref(), &[pool_account.nonce]])]
    pool_signer: AccountInfo<'info>,
    #[account(
        mut,
        constraint = redeemable_mint.mint_authority == COption::Some(*pool_signer.key)
    )]
    pub redeemable_mint: CpiAccount<'info, Mint>,
    #[account(mut, constraint = pool_watermelon.owner == *pool_signer.key)]
    pub pool_watermelon: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    pub user_authority: AccountInfo<'info>,
    #[account(mut, constraint = user_watermelon.owner == *user_authority.key)]
    pub user_watermelon: CpiAccount<'info, TokenAccount>,
    #[account(mut, constraint = user_redeemable.owner == *user_authority.key)]
    pub user_redeemable: CpiAccount<'info, TokenAccount>,
    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct WithdrawPoolUsdc<'info> {
    #[account(has_one = pool_usdc, has_one = distribution_authority)]
    pub pool_account: ProgramAccount<'info, PoolAccount>,
    #[account(seeds = [pool_account.watermelon_mint.as_ref(), &[pool_account.nonce]])]
    pub pool_signer: AccountInfo<'info>,
    #[account(mut, constraint = pool_usdc.owner == *pool_signer.key)]
    pub pool_usdc: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    pub distribution_authority: AccountInfo<'info>,
    #[account(signer)]
    pub payer: AccountInfo<'info>,
    #[account(mut)]
    pub creator_usdc: CpiAccount<'info, TokenAccount>,
    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct WithdrawPoolWatermelon<'info> {
    #[account(has_one = pool_watermelon, has_one = distribution_authority)]
    pub pool_account: ProgramAccount<'info, PoolAccount>,
    #[account(seeds = [pool_account.watermelon_mint.as_ref(), &[pool_account.nonce]])]
    pub pool_signer: AccountInfo<'info>,
    #[account(mut, constraint = pool_watermelon.owner == *pool_signer.key)]
    pub pool_watermelon: CpiAccount<'info, TokenAccount>,
    #[account(signer)]
    pub distribution_authority: AccountInfo<'info>,
    #[account(signer)]
    pub payer: AccountInfo<'info>,
    #[account(mut)]
    pub creator_watermelon: CpiAccount<'info, TokenAccount>,
    #[account(constraint = token_program.key == &token::ID)]
    pub token_program: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
}
#[derive(Accounts)]
pub struct ModifyIdoTime<'info> {
    #[account(mut, has_one = distribution_authority)]
    pub pool_account: ProgramAccount<'info, PoolAccount>,
    #[account(signer)]
    pub distribution_authority: AccountInfo<'info>,
    #[account(signer)]
    pub payer: AccountInfo<'info>,
}

#[account]
pub struct PoolAccount {
    pub redeemable_mint: Pubkey,
    pub pool_watermelon: Pubkey,
    pub watermelon_mint: Pubkey,
    pub pool_usdc: Pubkey,
    pub distribution_authority: Pubkey,
    pub nonce: u8,
    pub num_ido_tokens: u64,
    pub start_ido_ts: i64,
    pub end_deposits_ts: i64,
    pub end_ido_ts: i64,
    pub withdraw_melon_ts: i64,
}

#[error]
pub enum ErrorCode {
    #[msg("IDO must start in the future")]
    IdoFuture, //300, 0x12c
    #[msg("IDO times are non-sequential")]
    SeqTimes, //301, 0x12d
    #[msg("IDO has not started")]
    StartIdoTime, //302, 0x12e
    #[msg("Deposits period has ended")]
    EndDepositsTime, //303, 0x12f
    #[msg("IDO has ended")]
    EndIdoTime, //304, 0x130
    #[msg("IDO has not finished yet")]
    IdoNotOver, //305, 0x131
    #[msg("Insufficient USDC")]
    LowUsdc, //306, 0x132
    #[msg("Insufficient redeemable tokens")]
    LowRedeemable, //307, 0x133
    #[msg("USDC total and redeemable total don't match")]
    UsdcNotEqRedeem, //308, 0x134
    #[msg("Given nonce is invalid")]
    InvalidNonce, //309, 0x135
    #[msg("Invalid param")]
    InvalidParam, //310, 0x136
    #[msg("Cannot withdraw USDC after depositing")]
    UsdcWithdrawNotAllowed, //311, 0x137
    #[msg("Tokens still need to be redeemed")]
    WithdrawTokensNotAllowed, //311, 0x138
}

// Access control modifiers.

// Asserts the IDO starts in the future.
fn future_start_time<'info>(ctx: &Context<InitializePool<'info>>, start_ido_ts: i64) -> Result<()> {
    if !(ctx.accounts.clock.unix_timestamp < start_ido_ts) {
        return Err(ErrorCode::IdoFuture.into());
    }
    Ok(())
}

// Asserts the IDO is in the first phase.
fn unrestricted_phase<'info>(ctx: &Context<ExchangeUsdcForRedeemable<'info>>) -> Result<()> {
    if !(ctx.accounts.pool_account.start_ido_ts < ctx.accounts.clock.unix_timestamp) {
        return Err(ErrorCode::StartIdoTime.into());
    } else if !(ctx.accounts.clock.unix_timestamp < ctx.accounts.pool_account.end_deposits_ts) {
        return Err(ErrorCode::EndDepositsTime.into());
    }
    Ok(())
}

// Asserts the IDO is in the second phase.
fn withdraw_only_phase(ctx: &Context<ExchangeRedeemableForUsdc>) -> Result<()> {
    if !(ctx.accounts.pool_account.start_ido_ts < ctx.accounts.clock.unix_timestamp) {
        return Err(ErrorCode::StartIdoTime.into());
    } else if !(ctx.accounts.clock.unix_timestamp < ctx.accounts.pool_account.end_ido_ts) {
        return Err(ErrorCode::EndIdoTime.into());
    }
    Ok(())
}

// Asserts the IDO sale period has ended, based on the current timestamp.
fn ido_over<'info>(
    pool_account: &ProgramAccount<'info, PoolAccount>,
    clock: &Sysvar<'info, Clock>,
) -> Result<()> {
    if !(pool_account.withdraw_melon_ts < clock.unix_timestamp) {
        return Err(ErrorCode::IdoNotOver.into());
    }
    Ok(())
}
