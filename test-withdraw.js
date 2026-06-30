/**
 * test-withdraw.js
 *
 * Tests withdrawal from Magicblock PER back to the on-chain wallet.
 * Does NOT deposit or transfer — only withdraws.
 *
 * Usage:
 *   node test-withdraw.js
 *
 * Requires:
 *   - .env with SERVER_WALLET_PRIVATE_KEY and SOLANA_NETWORK=devnet
 *   - The server wallet must have USDC deposited into the PER
 */

require('dotenv').config();
const SolanaService = require('./utils/solana');

const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const WITHDRAW_AMOUNT = 1_000_000; // 1 USDC in base units

async function run() {
  console.log('='.repeat(60));
  console.log('  Test: Magicblock Withdraw from PER');
  console.log('='.repeat(60));
  console.log();

  // Step 1: Initialize SolanaService
  console.log('📋 Step 1: Initialize SolanaService');
  let solanaService;
  try {
    solanaService = new SolanaService();
    const pubkey = solanaService.getServerWallet().publicKey.toBase58();
    console.log(`   ✅ PASS — Server wallet: ${pubkey}`);
    console.log(`   Network: ${solanaService.network}`);
  } catch (error) {
    console.error(`   ❌ FAIL — ${error.message}`);
    process.exit(1);
  }
  console.log();

  // Step 2: Magicblock Authentication
  console.log('📋 Step 2: Magicblock Authentication');
  try {
    await solanaService.getMagicblockAuthToken();
    console.log(`   ✅ PASS — Authenticated`);
  } catch (error) {
    console.error(`   ❌ FAIL — ${error.message}`);
    if (error.response) {
      console.error(`   API Response:`, error.response.data);
    }
    process.exit(1);
  }
  console.log();

  // Step 3: Check PER balance
  console.log('📋 Step 3: Check PER Balance');
  let perBalance = 0;
  try {
    perBalance = await solanaService.getMagicblockPrivateBalance(USDC_DEVNET_MINT);
    const uiBalance = perBalance / 1_000_000;
    console.log(`   PER balance: ${perBalance} base units (${uiBalance} USDC)`);
  } catch (error) {
    console.warn(`   ⚠️ Could not fetch PER balance: ${error.message}`);
  }
  console.log();

  // Step 4: Withdraw (if sufficient PER balance)
  console.log('📋 Step 4: Withdraw from Magicblock PER');
  if (perBalance >= WITHDRAW_AMOUNT) {
    try {
      const sig = await solanaService.withdrawFromMagicblockPER(WITHDRAW_AMOUNT, USDC_DEVNET_MINT);
      console.log(`   ✅ PASS — Withdraw signature: ${sig}`);
    } catch (error) {
      console.error(`   ❌ FAIL — ${error.message}`);
      if (error.response) {
        console.error(`   API Response:`, error.response.data);
      }
      process.exit(1);
    }
  } else {
    console.log(`   ⏭️ SKIP — Insufficient PER balance (${perBalance} base units). Need at least ${WITHDRAW_AMOUNT}.`);
    console.log(`   Deposit USDC into the PER first using test-deposit.js or test-magicblock-usdc.js`);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('  Withdraw test complete.');
  console.log('='.repeat(60));
}

run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
