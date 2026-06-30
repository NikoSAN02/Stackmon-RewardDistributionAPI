/**
 * test-magicblock-usdc.js
 * 
 * End-to-end test script for Magicblock USDC private transfers.
 * Tests: authentication, private balance check, deposit, and transfer.
 * 
 * Usage:
 *   node test-magicblock-usdc.js
 * 
 * Requires:
 *   - .env with SERVER_WALLET_PRIVATE_KEY and SOLANA_NETWORK=devnet
 *   - The server wallet must have some devnet USDC
 *   - Set TEST_RECIPIENT_ADDRESS env var to test transfer (optional)
 */

require('dotenv').config();

const SolanaService = require('./utils/solana');

const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

async function runTests() {
  console.log('='.repeat(60));
  console.log('  Magicblock USDC Private Transfer — Test Suite');
  console.log('='.repeat(60));
  console.log();

  let solanaService;

  // ── Test 1: Initialize SolanaService ────────────────────────────
  console.log('📋 Test 1: Initialize SolanaService');
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

  // ── Test 2: Magicblock Authentication (Challenge → Sign → Login) ─
  console.log('📋 Test 2: Magicblock Authentication');
  try {
    const token = await solanaService.getMagicblockAuthToken();
    console.log(`   ✅ PASS — Got auth token (${token.substring(0, 20)}...)`);

    // Test caching — second call should be instant
    const startCache = Date.now();
    const cachedToken = await solanaService.getMagicblockAuthToken();
    const cacheMs = Date.now() - startCache;
    console.log(`   ✅ PASS — Cached token returned in ${cacheMs}ms (same token: ${token === cachedToken})`);
  } catch (error) {
    console.error(`   ❌ FAIL — ${error.message}`);
    if (error.response) {
      console.error(`   API Response:`, error.response.data);
    }
  }
  console.log();

  // ── Test 3: Check Server Ephemeral Balance ──────────────────────
  console.log('📋 Test 3: Check Server Ephemeral Balance');
  let ephemeralBalance = 0;
  try {
    ephemeralBalance = await solanaService.getMagicblockPrivateBalance(USDC_DEVNET_MINT);
    const uiBalance = ephemeralBalance / 1_000_000;
    console.log(`   ✅ PASS — Ephemeral balance: ${ephemeralBalance} base units (${uiBalance} USDC)`);
  } catch (error) {
    console.warn(`   ⚠️ WARN — Could not fetch ephemeral balance: ${error.message}`);
    if (error.response) {
      console.warn(`   API Response:`, error.response.data);
    }
    console.log('   This is expected if the server wallet has never deposited into the PER.');
  }
  console.log();

  // ── Test 4: Check Server Base USDC Balance ──────────────────────
  console.log('📋 Test 4: Check Server Base (On-chain) USDC Balance');
  let baseBalance = 0;
  try {
    const { PublicKey } = require('@solana/web3.js');
    const { getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');

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
    console.log(`   ✅ PASS — Base USDC balance: ${balanceInfo.value.uiAmountString} USDC (${balanceInfo.value.amount} base units)`);
    console.log(`   ATA: ${serverATA.address.toBase58()}`);
  } catch (error) {
    console.error(`   ❌ FAIL — ${error.message}`);
    console.log('   The server wallet may not have a USDC token account on devnet.');
  }
  console.log();

  // ── Test 5: Deposit into PER (only if base balance allows) ──────
  console.log('📋 Test 5: Deposit USDC into Magicblock PER');
  if (baseBalance >= 1_000_000) { // At least 1 USDC
    try {
      const depositAmount = 1_000_000; // 1 USDC
      console.log(`   Depositing ${depositAmount} base units (1 USDC) into PER...`);
      const sig = await solanaService.depositToMagicblockPER(depositAmount, USDC_DEVNET_MINT);
      console.log(`   ✅ PASS — Deposit signature: ${sig}`);
    } catch (error) {
      console.error(`   ❌ FAIL — ${error.message}`);
      if (error.response) {
        console.error(`   API Response:`, error.response.data);
      }
    }
  } else {
    console.log(`   ⏭️ SKIP — Insufficient base USDC balance (${baseBalance} base units). Need at least 1,000,000.`);
    console.log(`   Fund the server wallet with devnet USDC first.`);
  }
  console.log();

  // ── Test 6: Private Transfer (only if a recipient is provided) ──
  const recipientAddress = process.env.TEST_RECIPIENT_ADDRESS;
  console.log('📋 Test 6: Private Ephemeral-to-Ephemeral Transfer');
  if (recipientAddress) {
    try {
      const transferAmount = 5; // 0.1 USDC
      console.log(`   Transferring ${transferAmount} USDC to ${recipientAddress}...`);
      const sig = await solanaService.transferMagicblock(recipientAddress, transferAmount, USDC_DEVNET_MINT);
      console.log(`   ✅ PASS — Transfer signature: ${sig}`);
    } catch (error) {
      console.error(`   ❌ FAIL — ${error.message}`);
      if (error.response) {
        console.error(`   API Response:`, error.response.data);
      }
      // Check if this is a "recipient not deposited" error
      if (error.message.includes('Private Ephemeral Rollup')) {
        console.log('   💡 The recipient must deposit USDC into the PER before receiving private transfers.');
      }
    }
  } else {
    console.log(`   ⏭️ SKIP — No TEST_RECIPIENT_ADDRESS set in environment.`);
    console.log(`   Set TEST_RECIPIENT_ADDRESS=<wallet_pubkey> to test a transfer.`);
  }
  console.log();

  // ── Test 7: Check Updated Ephemeral Balance ─────────────────────
  console.log('📋 Test 7: Re-check Ephemeral Balance After Operations');
  try {
    const newBalance = await solanaService.getMagicblockPrivateBalance(USDC_DEVNET_MINT);
    const uiBalance = newBalance / 1_000_000;
    console.log(`   ✅ PASS — Updated ephemeral balance: ${newBalance} base units (${uiBalance} USDC)`);
    if (ephemeralBalance > 0) {
      const diff = newBalance - ephemeralBalance;
      console.log(`   Change: ${diff >= 0 ? '+' : ''}${diff} base units`);
    }
  } catch (error) {
    console.warn(`   ⚠️ WARN — ${error.message}`);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('  Test suite complete.');
  console.log('='.repeat(60));
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
