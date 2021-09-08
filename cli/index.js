const anchor = require("@project-serum/anchor");
const serum = require("@project-serum/common");
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers')
const { TokenInstructions } = require("@project-serum/serum");
const {
  getAssociatedTokenAddress
} = require('@project-serum/associated-token');

const path = require('path');
const fs = require('fs');

const MULTISIG_PROGRAM_ID = '';
const MULTISIG_ACCOUNT = '';

const provider = anchor.Provider.local(process.env.CLUSTER_RPC_URL);
// Configure the client to use the local cluster.
anchor.setProvider(provider);

const program = anchor.workspace.IdoPool;

// TODO: remove this constant once @project-serum/serum uses the same version
//       of @solana/web3.js as anchor (or switch packages).
const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(
  TokenInstructions.TOKEN_PROGRAM_ID.toString()
);

async function initPool(
  usdcMint, watermelonMint, creatorWatermelon, watermelonIdoAmount,
  startIdoTs, endDepositsTs, endIdoTs, withdrawTs, distributionAuthority) {

  // We use the watermelon mint address as the seed, could use something else though.
  const [_poolSigner, nonce] = await anchor.web3.PublicKey.findProgramAddress(
    [watermelonMint.toBuffer()],
    program.programId
  );
  poolSigner = _poolSigner;

  // fetch usdc mint to set redeemable decimals to the same value
  const mintInfo = await serum.getMintInfo(provider, usdcMint)

  // Pool doesn't need a Redeemable SPL token account because it only
  // burns and mints redeemable tokens, it never stores them.
  redeemableMint = await serum.createMint(provider, poolSigner, mintInfo.decimals);
  poolWatermelon = await serum.createTokenAccount(provider, watermelonMint, poolSigner);
  poolUsdc = await serum.createTokenAccount(provider, usdcMint, poolSigner);
  poolAccount = new anchor.web3.Account();


  console.log('initializePool', watermelonIdoAmount.toString(), nonce, startIdoTs.toString(), endDepositsTs.toString(), endIdoTs.toString(), withdrawTs.toString());
  // Atomically create the new account and initialize it with the program.
  await program.rpc.initializePool(
    watermelonIdoAmount,
    nonce,
    startIdoTs,
    endDepositsTs,
    endIdoTs,
    withdrawTs,
    {
      accounts: {
        poolAccount: poolAccount.publicKey,
        poolSigner,
        distributionAuthority,
        payer: provider.wallet.publicKey,
        creatorWatermelon,
        redeemableMint,
        usdcMint,
        poolWatermelon,
        poolUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
      signers: [poolAccount],
      instructions: [
        await program.account.poolAccount.createInstruction(poolAccount),
      ],
    }
  );

  console.log(`🏦 IDO pool initialized with ${(watermelonIdoAmount.toNumber() / 1000000).toFixed(2)} tokens`);
  console.log(`Pool Account: ${poolAccount.publicKey.toBase58()}`);
  console.log(`Pool Authority: ${distributionAuthority.toBase58()}`);
  console.log(`Redeem Mint: ${redeemableMint.toBase58()}`);
  console.log(`🍉 Account: ${poolWatermelon.toBase58()}`);
  console.log(`💵 Account: ${poolUsdc.toBase58()}`);
}


async function bid(poolAccount, userUsdc, bidAmount, userRedeemable) {

  const account = await program.account.poolAccount.fetch(poolAccount);

  // We use the watermelon mint address as the seed, could use something else though.
  const [_poolSigner, nonce] = await anchor.web3.PublicKey.findProgramAddress(
    [account.watermelonMint.toBuffer()],
    program.programId
  );
  poolSigner = _poolSigner;

  const currentBid = await serum.getTokenAccount(provider, userRedeemable);

  if (currentBid.amount.lt(bidAmount)) {
    const depositAmount = bidAmount.sub(currentBid.amount);
    console.log(`increasing bid by ${(depositAmount.toNumber() / 1000000).toFixed(2)} 💵`);

    await program.rpc.exchangeUsdcForRedeemable(
      depositAmount,
      {
        accounts: {
          poolAccount,
          poolSigner,
          redeemableMint: account.redeemableMint,
          poolUsdc: account.poolUsdc,
          userAuthority: provider.wallet.publicKey,
          userUsdc,
          userRedeemable,
          tokenProgram: TOKEN_PROGRAM_ID,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        },
      });
  } else if (currentBid.amount.gt(bidAmount)) {
    const withdrawAmount = currentBid.amount.sub(bidAmount);
    console.log(`decreasing bid by ${(withdrawAmount.toNumber() / 1000000).toFixed(2)} 💵`);

    await program.rpc.exchangeRedeemableForUsdc(withdrawAmount, {
      accounts: {
        poolAccount,
        poolSigner,
        redeemableMint: account.redeemableMint,
        poolUsdc: account.poolUsdc,
        userAuthority: provider.wallet.publicKey,
        userUsdc,
        userRedeemable,
        tokenProgram: TOKEN_PROGRAM_ID,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
    });

  } else {
    console.log('bid unchanged 💎');
  }
}

async function createMultisigTxWithdrawUsdc(poolAccount, amount, receiver) {
  // console.log('multisig program id:', MULTISIG_PROGRAM_ID);
  
  // const multisigProgram = new anchor.Program(
  //   JSON.parse(fs.readFileSync(path.join(__dirname, "multisig.idl.json")).toString()),
  //   new anchor.PublicKey(MULTISIG_PROGRAM_ID),
  //   new anchor.Provider(provider.connection, provider.wallet, Provider.defaultOptions())
  // );
  
  // const pool = await program.account.poolAccount.fetch(poolAccount);
  // const poolUsdc = await serum.getTokenAccount(provider, pool.poolUsdc);
  // const ix = program.instruction.withdrawPoolUsdc(new anchor.BN(amount), {
  //   accounts: {
  //     poolAccount: poolAccount,
  //     poolSigner: poolUsdc.owner, //PDA
  //     poolUsdc: pool.poolUsdc,
  //     distributionAuthority: pool.distributionAuthority,
  //     creatorUsdc: receiver,
  //     tokenProgram: TOKEN_PROGRAM_ID,
  //     clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
  //   },
  // })
  // const txSize = 360;//~= 100 + 34*accounts + instruction_data_len
  // const transaction = new web3.Account();
  // const txid = await multisigProgram.rpc.createTransaction(
  //   ix.programId,
  //   ix.keys,
  //   ix.data,
  //   {
  //     accounts: {
  //       multisig: new anchor.PublicKey(MULTISIG_ACCOUNT),
  //       transaction: transaction.publicKey,
  //       proposer: provider.wallet.publicKey,
  //       rent: web3.SYSVAR_RENT_PUBKEY
  //     },
  //     instructions: [
  //       await (multisigProgram.account.transaction.createInstruction as any)(
  //         transaction,
  //         txSize
  //       )
  //     ],
  //     signers: [transaction, provider.wallet]
  //   }
  // );
  // console.log('txid:', txid);
}

async function withdrawUsdc(poolAccount) {
  const pool = await program.account.poolAccount.fetch(poolAccount);
  const poolUsdc = await serum.getTokenAccount(provider, pool.poolUsdc);
  const associatedUsdc = await getAssociatedTokenAddress(
    provider.wallet.publicKey,
    poolUsdc.mint,
  );
  console.log('associatedUsdc: ', associatedUsdc.toBase58());
  const ixs = [];
  try {
    await serum.getTokenAccount(provider, associatedUsdc);
  } catch (e) { //associated usdc token account not found
    // ixs.push(await createAssociatedTokenAccount(
    //   provider.wallet.publicKey, provider.wallet.publicKey, poolUsdc.mint
    // ))
  }

  const txid = await program.rpc.withdrawPoolUsdc(new anchor.BN(poolUsdc.amount.toString()), {
    accounts: {
      poolAccount: poolAccount,
      poolSigner: poolUsdc.owner, //PDA
      poolUsdc: pool.poolUsdc,
      distributionAuthority: provider.wallet.publicKey,
      creatorUsdc: associatedUsdc,
      tokenProgram: TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    },
    // instructions: ixs,
  });
  console.log('txid: ', txid);
}

const usdc_mint = {
  describe: 'the mint of the token sale bids 💵',
  type: 'string'
}

const watermelon_mint = {
  describe: 'the mint of the token for sale 🍉',
  type: 'string'
}

const watermelon_account = {
  describe: 'the account supplying the token for sale 🍉',
  type: 'string'
}

const watermelon_amount = {
  describe: 'the amount of tokens offered in this sale 🍉',
  type: 'number'
}

const pool_account = {
  describe: 'the token sale pool account 🏦',
  type: 'string'
}

const start_time = {
  describe: 'the unix time at which the token sale is starting',
  default: 60 + (Date.now() / 1000),
  type: 'number'
}

const deposit_duration = {
  describe: 'the number of seconds users can deposit into the pool',
  default: 24 * 60 * 60,
  type: 'number'
}

const cancel_duration = {
  describe: 'the number of seconds users can withdraw from the pool to cancel their bid',
  default: 24 * 60 * 60,
  type: 'number'
}

const withdraw_ts = {
  describe: 'the timestamp users can withdraw watermelon from pool after ido over',
  default: new Date().setDate(new Date().getDate() + 3) / 1000,
  type: 'number'
}


yargs(hideBin(process.argv))
  .command(
    'init <usdc_mint> <watermelon_mint> <watermelon_account> <watermelon_amount> <authority>',
    'initialize IDO pool',
    y => y
      .positional('usdc_mint', usdc_mint)
      .positional('watermelon_mint', watermelon_mint)
      .positional('watermelon_account', { describe: 'the account supplying the token for sale 🍉', type: 'string' })
      .positional('watermelon_amount', { describe: 'the amount of tokens offered in this sale 🍉', type: 'number' })
      .positional('authority', {describe: 'distributionAuthority', type: 'string'})
      .option('start_time', start_time)
      .option('deposit_duration', deposit_duration)
      .option('cancel_duration', cancel_duration)
      .option('withdraw_ts', withdraw_ts),
    async args => {
      const start = new anchor.BN(args.start_time);
      const endDeposits = new anchor.BN(args.deposit_duration).add(start);
      const endIdo = new anchor.BN(args.cancel_duration).add(endDeposits);
      const withdrawTs = new anchor.BN(args.withdraw_ts);
      console.log('args: ', args);

      const mintInfo = await serum.getMintInfo(provider, new anchor.web3.PublicKey(args.watermelon_mint));

      initPool(
        new anchor.web3.PublicKey(args.usdc_mint),
        new anchor.web3.PublicKey(args.watermelon_mint),
        new anchor.web3.PublicKey(args.watermelon_account),
        new anchor.BN(args.watermelon_amount * (10 ** mintInfo.decimals)),
        start,
        endDeposits,
        endIdo,
        withdrawTs,
        new anchor.web3.PublicKey(args.authority)
      );
    })
  .command(
    'bid <pool_account> <usdc_account> <usdc_amount> <redeemable_account>',
    'place bid in IDO sale',
    y => y
      .positional('pool_account', pool_account)
      .positional('usdc_account', { describe: 'the account supplying the token sale bids 💵', type: 'string' })
      .positional('usdc_amount', { describe: 'the amount of tokens bid for this sale 💵', type: 'number' })
      .positional('redeemable_account', { describe: 'the account receiving the redeemable pool token', type: 'string' }),
    args => {
      // throw new Error('decimal should be processed');
      bid(
        new anchor.web3.PublicKey(args.pool_account),
        new anchor.web3.PublicKey(args.usdc_account),
        new anchor.BN(args.usdc_amount * 1000000), // assuming 6 decimals
        new anchor.web3.PublicKey(args.redeemable_account)
      );
    })
  .command(
    'inspect <pool_account>',
    'inspect pool config',
    y => y.positional('pool_account', pool_account),
    async args => {
      const account = await program.account.poolAccount.fetch(new anchor.web3.PublicKey(args.pool_account));

      for (const key in account) {
        const v = account[key];
        if (v.toBase58) {
          console.log(key.padStart(22, ' '), v.toBase58());
        } else if (v.toNumber) {
          console.log(key.padStart(22, ' '), v.toString(), key.endsWith('Ts') ? new Date(v.toNumber() * 1000) : '');
        } else {
          console.log(key.padStart(22, ' '), v);
        }
      }
      const now = new Date();
      console.log('now'.padStart(22, ' '), ''.padStart(10, ' '), now);
    }
  )
  .command(
    'withdraw-usdc <pool_account>',
    'withdraw usdc',
    y => y.positional('pool_account', pool_account),
    async args => {
      console.log('args', args);
      await withdrawUsdc(new anchor.web3.PublicKey(args.pool_account));
    }
  )
  .command(
    'create-multisig-tx-withdraw-usdc',
    'multisig',
    y => y.positional('pool_account', pool_account),
    async args => {
      console.log('args:', args);
      console.log('program:', program);
      createMultisigTxWithdrawUsdc();
    }
  )
  .argv;
