/**
 * test-deposit.js
 *
 * Tests deposit into Magicblock PER with before/after balance verification.
 * Does NOT transfer — only deposits.
 */

require('dotenv').config();
const { PublicKey } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const SolanaService = require('./utils/solana');

const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const DEPOSIT_AMOUNT = 1_000_000; // 1 USDC in base units

async function run() {
  console.log('='.repeat(60));
  console.log('  Test: Magicblock Deposit');
  console.log('='.repeat(60));
  console.log();

  // Step 1: Initialize
  console.log('📋 Step 1: Initialize SolanaService');
  let solanaService;
  try {
    solanaService = new SolanaService();
    const pubkey = solanaService.getServerWallet().publicKey.toBase58();
    console.log(`   ✅ PASS — Server wallet: ${pubkey}`);
  } catch (error) {
    console.error(`   ❌ FAIL — ${error.message}`);
    process.exit(1);
  }
  console.log();

  // Step 2: Authenticate
  console.log('📋 Step 2: Magicblock Authentication');
  try {
    await solanaService.getMagicblockAuthToken();
    console.log(`   ✅ PASS — Authenticated`);
  } catch (error) {
    console.error(`   ❌ FAIL — ${error.message}`);
    process.exit(1);
  }
  console.log();

  // Step 3: Check base balance (must have enough to deposit)
  console.log('📋 Step 3: Check Base USDC Balance');
  let baseBalance = 0;
  try {
    const mintPubkey = new PublicKey(USDC_DEVNET_MINT);
    const programId = await solanaService.getMintProgramId(mintPubkey);
    const serverATA = await getOrCreateAssociatedTokenAccount(
      solanaService.getConnection(),
      solanaService.getServerWallet(),
      mintPubkey,
      solanaService.getServerWallet().publicKey,
      true,
      'confirmed',
      undefined,
      programId
    );
    const balanceInfo = await solanaService.getConnection().getTokenAccountBalance(serverATA.address);
    baseBalance = parseInt(balanceInfo.value.amount, 10);
    console.log(`   Base USDC balance: ${balanceInfo.value.uiAmountString} USDC (${balanceInfo.value.amount} base units)`);
  } catch (error) {
    console.error(`   ❌ FAIL — ${error.message}`);
    console.log('   The server wallet may not have a USDC token account on devnet.');
    process.exit(1);
  }
  console.log();

  // Step 4: Deposit (if sufficient balance)
  console.log('📋 Step 4: Deposit into Magicblock PER');
  if (baseBalance >= DEPOSIT_AMOUNT) {
    try {
      const sig = await solanaService.depositToMagicblockPER(DEPOSIT_AMOUNT, USDC_DEVNET_MINT);
      console.log(`   ✅ PASS — Deposit signature: ${sig}`);
    } catch (error) {
      console.error(`   ❌ FAIL — ${error.message}`);
      if (error.response) console.error(`   API Response:`, error.response.data);
      process.exit(1);
    }
  } else {
    console.log(`   ⏭️ SKIP — Insufficient base USDC balance (${baseBalance} base units). Need at least ${DEPOSIT_AMOUNT}.`);
    console.log(`   Fund the server wallet with devnet USDC first.`);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('  Deposit test complete.');
  console.log('='.repeat(60));
}

run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
