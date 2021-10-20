const anchor = require("@project-serum/anchor");
const anchor5 = require("anchor5");
const serum = require("@project-serum/common");
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers')
const { TokenInstructions } = require("@project-serum/serum");
const {
  getAssociatedTokenAddress
} = require('@project-serum/associated-token');

const path = require('path');
const fs = require('fs');
const browserBuffer = require('browserBuffer');

const {
  encode
} = require('js-base64');

const MULTISIG_PROGRAM_ID = 'A9HAbnCwoD6f2NkZobKFf6buJoN9gUVVvX5PoUnDHS6u';

// mainnet production multisig
const MULTISIG_ACCOUNT = 'GZXtZrRTaazATgJpWKReqUEYE6L2CSQRHkFnXQDPA2vD'; //mainnet
const MULTISIG_AUTHORITY = '5jwBGfXVpcEY9Hqmw2hCu77NMnoMeVKzgKCChf82d1Te';

// mainnet test multisig
// const MULTISIG_ACCOUNT = '2xg5VUVr7sPeeuqXdTNghxg2eMqv54JDdLHRjnfigN9p'; //mainnet
// const MULTISIG_AUTHORITY = 'EkBHKeUfLdJ26oyLSAbKVxzGCRSM4oAmV9GYumS7r7gS'; //

function getKeypair(pk_path) {
  const pk = JSON.parse(fs.readFileSync(pk_path).toString())

  const pk_uint8 = Uint8Array.from(pk)
  const signerAccount = anchor.web3.Keypair.fromSecretKey(pk_uint8)
  return signerAccount
}

let provider
function setProvider() {
  const network = "https://api.mainnet-beta.solana.com";
  const opts = {
    preflightCommitment: "processed"
  }
  const connection = new anchor.web3.Connection(network, opts.preflightCommitment)
  const pk_path = 'TBD'
  const signerAccount = getKeypair(pk_path)
  const wallet = new anchor.Wallet(signerAccount)
  provider = new anchor.Provider(
    connection, wallet, opts.preflightCommitment,
  )
  anchor.setProvider(provider)
}
setProvider()
// Configure the client to use the local cluster.
function getProgram(idl_path, program_id, provider) {
  const idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, idl_path)))
  const program = new anchor.Program(idl, program_id, provider)
  return program
}

const idl_path = '../target/idl/ido_pool.json'
const program_id = 'TBD'
const program = getProgram(idl_path, program_id, provider)

const multisigProgram = new anchor5.Program(
  JSON.parse(fs.readFileSync(path.join(__dirname, "multisig.idl.json")).toString()),
  new anchor5.web3.PublicKey(MULTISIG_PROGRAM_ID),
  new anchor5.Provider(provider.connection, provider.wallet, anchor5.Provider.defaultOptions())
);


// TODO: remove this constant once @project-serum/serum uses the same version
//       of @solana/web3.js as anchor (or switch packages).
const TOKEN_PROGRAM_ID = new anchor.web3.PublicKey(
  TokenInstructions.TOKEN_PROGRAM_ID.toString()
);

async function createMultisigTxModifyPool(poolAccount, startIdoTs, endDepositsTs, endIdoTs, withdrawTs, dryRun) {
  console.log('multisig program id:', MULTISIG_PROGRAM_ID);
  const ix = program.instruction.modifyIdoTime(
    startIdoTs,
    endDepositsTs,
    endIdoTs,
    withdrawTs,
    {
      accounts: {
        poolAccount: poolAccount,
        distributionAuthority: new anchor.web3.PublicKey(MULTISIG_AUTHORITY),
        payer: provider.wallet.publicKey,
      },
    }
  );
  if (dryRun) {
    const [startIdoT, endDepositsT, endIdoT, withdrawT] = [
      new Date(startIdoTs.toNumber() * 1000),
      new Date(endDepositsTs.toNumber() * 1000),
      new Date(endIdoTs.toNumber() * 1000),
      new Date(withdrawTs.toNumber() * 1000),
    ];
    console.log("   startIdoTs", startIdoTs.toString(), startIdoT, 'local', startIdoT.toLocaleString());
    console.log("endDepositsTs", endDepositsTs.toString(), endDepositsT, 'local', endDepositsT.toLocaleString());
    console.log("     endIdoTs", endIdoTs.toString(), endIdoT, 'local', endIdoT.toLocaleString());
    console.log("   withdrawTs", withdrawTs.toString(), withdrawT, 'local', withdrawT.toLocaleString());
    console.log('instructionBase64: ', encode(browserBuffer.Buffer.from(ix.data).toString()));
    console.log('dry run');
    return
  }

  const txSize = 250;//~= 100 + 34*accounts + instruction_data_len
  const transaction = new anchor5.web3.Account();
  const txid = await multisigProgram.rpc.createTransaction(
    ix.programId,
    ix.keys,
    ix.data,
    {
      accounts: {
        multisig: new anchor5.web3.PublicKey(MULTISIG_ACCOUNT),
        transaction: transaction.publicKey,
        proposer: provider.wallet.publicKey,
        rent: anchor5.web3.SYSVAR_RENT_PUBKEY
      },
      instructions: [
        await multisigProgram.account.transaction.createInstruction(
          transaction,
          txSize
        )
      ],
      signers: [transaction, provider.wallet.payer]
    }
  );
  console.log('transaction', transaction.publicKey.toBase58());
  console.log('txid:', txid);
}

async function createMultisigTxInitPool(
  usdcMint, watermelonMint, creatorWatermelon, watermelonIdoAmount,
  startIdoTs, endDepositsTs, endIdoTs, withdrawTs, dryRun) {

  console.log('multisig program id:', MULTISIG_PROGRAM_ID);

  // We use the watermelon mint address as the seed, could use something else though.
  const [_poolSigner, nonce] = await anchor.web3.PublicKey.findProgramAddress(
    [watermelonMint.toBuffer()],
    program.programId
  );
  poolSigner = _poolSigner;

  if (dryRun) {
    console.log('_poolSigner: ', _poolSigner.toBase58());
    console.log('num_ido_tokens: ', watermelonIdoAmount.toString());
    const [startIdoT, endDepositsT, endIdoT, withdrawT] = [
      new Date(startIdoTs.toNumber() * 1000),
      new Date(endDepositsTs.toNumber() * 1000),
      new Date(endIdoTs.toNumber() * 1000),
      new Date(withdrawTs.toNumber() * 1000),
    ];
    console.log("   startIdoTs", startIdoTs.toString(), startIdoT, 'local', startIdoT.toLocaleString());
    console.log("endDepositsTs", endDepositsTs.toString(), endDepositsT, 'local', endDepositsT.toLocaleString());
    console.log("     endIdoTs", endIdoTs.toString(), endIdoT, 'local', endIdoT.toLocaleString());
    console.log("   withdrawTs", withdrawTs.toString(), withdrawT, 'local', withdrawT.toLocaleString());
    const simulateIx = program.instruction.initializePool(
      watermelonIdoAmount,
      nonce,
      startIdoTs,
      endDepositsTs,
      endIdoTs,
      withdrawTs,
      {
        accounts: {
          poolAccount: poolSigner, //just try to create ix
          poolSigner,
          distributionAuthority: new anchor.web3.PublicKey(MULTISIG_AUTHORITY),
          payer: provider.wallet.publicKey,
          creatorWatermelon,
          redeemableMint: poolSigner, //just try to create ix
          watermelonMint,
          usdcMint,
          poolWatermelon: poolSigner, //just try to create ix
          poolUsdc: poolSigner, //just try to create ix
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        },
      }
    );
    console.log('instructionBase64: ', encode(browserBuffer.Buffer.from(simulateIx.data).toString()));
    console.log('dry run');
    return
  }

  // fetch usdc mint to set redeemable decimals to the same value
  const mintInfo = await serum.getMintInfo(provider, usdcMint)

  // Pool doesn't need a Redeemable SPL token account because it only
  // burns and mints redeemable tokens, it never stores them.
  redeemableMint = await serum.createMint(provider, poolSigner, mintInfo.decimals);
  poolWatermelon = await serum.createTokenAccount(provider, watermelonMint, poolSigner);
  poolUsdc = await serum.createTokenAccount(provider, usdcMint, poolSigner);
  const poolAccount = new anchor.web3.Account();

  console.log('initializePool', watermelonIdoAmount.toString(), nonce, startIdoTs.toString(), endDepositsTs.toString(), endIdoTs.toString(), withdrawTs.toString());
  // Atomically create the new account and initialize it with the program.

  const ix = program.instruction.initializePool(
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
        distributionAuthority: new anchor.web3.PublicKey(MULTISIG_AUTHORITY),
        payer: provider.wallet.publicKey,
        creatorWatermelon,
        redeemableMint,
        watermelonMint,
        usdcMint,
        poolWatermelon,
        poolUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
    }
  );

  const txSize = 590;//~= 100 + 34*accounts + instruction_data_len
  const transaction = new anchor5.web3.Account();
  // console.log('[dbg] provider.wallet:', provider.wallet);
  const txid = await multisigProgram.rpc.createTransaction(
    ix.programId,
    ix.keys,
    ix.data,
    {
      accounts: {
        multisig: new anchor5.web3.PublicKey(MULTISIG_ACCOUNT),
        transaction: transaction.publicKey,
        proposer: provider.wallet.publicKey,
        rent: anchor5.web3.SYSVAR_RENT_PUBKEY
      },
      instructions: [
        await program.account.poolAccount.createInstruction(poolAccount),
        await multisigProgram.account.transaction.createInstruction(
          transaction,
          txSize
        )
      ],
      signers: [poolAccount, transaction, provider.wallet.payer]
    }
  );
  console.log('transaction', transaction.publicKey.toBase58());
  console.log('txid:', txid);
}

async function initPool(
  usdcMint, watermelonMint, creatorWatermelon, watermelonIdoAmount,
  startIdoTs, endDepositsTs, endIdoTs, withdrawTs, distributionAuthority, redeemableMintInfo) {

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
        watermelonMint,
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

  console.log(`🏦 IDO pool initialized with ${(watermelonIdoAmount.toNumber() / ((10 ** redeemableMintInfo.decimals))).toFixed(2)} tokens`);
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

async function createMultisigTxWithdrawUsdc(poolAccount, amount, receiver, dryRun) {
  console.log('multisig program id:', MULTISIG_PROGRAM_ID);

  const pool = await program.account.poolAccount.fetch(poolAccount);
  const poolUsdc = await serum.getTokenAccount(provider, pool.poolUsdc);
  const ix = program.instruction.withdrawPoolUsdc(new anchor.BN(amount), {
    accounts: {
      poolAccount: poolAccount,
      poolSigner: poolUsdc.owner, //PDA
      poolUsdc: pool.poolUsdc,
      distributionAuthority: pool.distributionAuthority,
      payer: provider.wallet.publicKey,
      creatorUsdc: receiver,
      tokenProgram: TOKEN_PROGRAM_ID,
      clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
    },
  })

  console.log('accounts: pool_account(0) -> pool_signer(1) -> pool_usdc(2) -> distribution_authority(3) -> payer(4) -> creator_usdc(5) -> token_program(6) -> clock(7)')
  for (let i = 0; i < ix.keys.length; i++) {
    const k = ix.keys[i];
    console.log(i, k.pubkey.toBase58().padEnd(45, ' '), ' w/s? ', k.isWritable, k.isSigner);
  }
  const localTransactionData = encode(browserBuffer.Buffer.from(ix.data).toString());
  console.log('instructionBase64: ', localTransactionData);

  if (dryRun) {
    console.log("dry-run");
    return
  }
  const txSize = 400;//~= 100 + 34*accounts + instruction_data_len
  const transaction = new anchor5.web3.Account();
  // console.log('[dbg] provider.wallet:', provider.wallet);
  const txid = await multisigProgram.rpc.createTransaction(
    ix.programId,
    ix.keys,
    ix.data,
    {
      accounts: {
        multisig: new anchor5.web3.PublicKey(MULTISIG_ACCOUNT),
        transaction: transaction.publicKey,
        proposer: provider.wallet.publicKey,
        rent: anchor5.web3.SYSVAR_RENT_PUBKEY
      },
      instructions: [
        await multisigProgram.account.transaction.createInstruction(
          transaction,
          txSize
        )
      ],
      signers: [transaction, provider.wallet.payer]
    }
  );
  console.log('transaction', transaction.publicKey.toBase58());
  console.log('txid:', txid);
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
      .positional('authority', { describe: 'distributionAuthority', type: 'string' })
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
        new anchor.web3.PublicKey(args.authority),
        mintInfo
      );
    })
  .command(
    'multisig-modify-pool-time <pool_account> <start_ido> <end_deposits> <end_ido> <withdraw_melon>',
    'create multisig tx to modify pool time',
    y => y
      .positional('pool_account', pool_account)
      .positional('start_ido', { type: 'number' })
      .positional('end_deposits', { type: 'number' })
      .positional('end_ido', { type: 'number' })
      .positional('withdraw_melon', { type: 'number' })
      .option('dry-run', { desc: 'dry run', type: 'boolean', default: false }),
    async args => {
      console.log('args', args);
      createMultisigTxModifyPool(
        new anchor.web3.PublicKey(args.pool_account),
        new anchor.BN(args.start_ido),
        new anchor.BN(args.end_deposits),
        new anchor.BN(args.end_ido),
        new anchor.BN(args.withdraw_melon),
        args.dryRun
      );
    }
  )
  .command(
    'multisig-init <usdc_mint> <watermelon_mint> <watermelon_account> <watermelon_amount>',
    'initialize IDO pool',
    y => y
      .positional('usdc_mint', usdc_mint)
      .positional('watermelon_mint', watermelon_mint)
      .positional('watermelon_account', { describe: 'the account supplying the token for sale 🍉', type: 'string' })
      .positional('watermelon_amount', { describe: 'the amount of tokens offered in this sale 🍉', type: 'number' })
      .option('start_time', start_time)
      .option('deposit_duration', deposit_duration)
      .option('cancel_duration', cancel_duration)
      .option('withdraw_ts', withdraw_ts)
      .option('dry-run', { desc: 'dry run', type: 'boolean', default: false }),
    async args => {
      const start = new anchor.BN(args.start_time);
      const endDeposits = new anchor.BN(args.deposit_duration).add(start);
      const endIdo = new anchor.BN(args.cancel_duration).add(endDeposits);
      const withdrawTs = new anchor.BN(args.withdraw_ts);
      console.log('args: ', args);

      const mintInfo = await serum.getMintInfo(provider, new anchor.web3.PublicKey(args.watermelon_mint));

      createMultisigTxInitPool(
        new anchor.web3.PublicKey(args.usdc_mint),
        new anchor.web3.PublicKey(args.watermelon_mint),
        new anchor.web3.PublicKey(args.watermelon_account),
        new anchor.BN(args.watermelon_amount * (10 ** mintInfo.decimals)),
        start,
        endDeposits,
        endIdo,
        withdrawTs,
        args.dryRun
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
  .command( //node cli/index.js create-multisig-tx-withdraw-usdc <pool_account> <receiver> <amount> --dry-run
    'create-multisig-tx-withdraw-usdc <pool_account> <receiver> <amount>',
    'multisig',
    y => y.positional('pool_account', pool_account)
      .positional('receiver', { desc: 'spl token account', type: 'string' })
      .positional('amount', { desc: 'token amount in minimum unit', type: 'string' })
      .option('dry-run', { desc: 'dry run', type: 'boolean', default: false }),
    async args => {
      console.log('args:', args);
      // console.log('program:', program);
      createMultisigTxWithdrawUsdc(
        new anchor.web3.PublicKey(args.pool_account),
        new anchor.BN(args.amount),
        new anchor.web3.PublicKey(args.receiver),
        args.dryRun
      );
    }
  )
  .argv;
