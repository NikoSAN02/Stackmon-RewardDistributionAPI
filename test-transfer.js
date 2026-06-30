/**
 * test-transfer.js
 *
 * Tests private ephemeral-to-ephemeral transfer with before/after balance checks.
 * If the sender's ephemeral balance is insufficient, the transfer will
 * auto-deposit (printed clearly if that happens).
 *
 * Usage:
 *   node test-transfer.js
 *
 * Requires:
 *   - .env with SERVER_WALLET_PRIVATE_KEY and SOLANA_NETWORK=devnet
 *   - Set TEST_RECIPIENT_ADDRESS env var to a wallet that has deposited into PER
 */

require('dotenv').config();
const SolanaService = require('./utils/solana');

const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

async function run() {
  console.log('='.repeat(60));
  console.log('  Test: Magicblock Private Transfer');
  console.log('='.repeat(60));
  console.log();

  const recipientAddress = process.env.TEST_RECIPIENT_ADDRESS;
  if (!recipientAddress) {
    console.log('❌ TEST_RECIPIENT_ADDRESS not set.');
    console.log('   Set this env var to the wallet pubkey you want to send USDC to.');
    console.log('   The recipient must have deposited into the PER before receiving private transfers.');
    process.exit(1);
  }

  // Step 1: Initialize
  console.log('📋 Step 1: Initialize SolanaService');
  let solanaService;
  try {
    solanaService = new SolanaService();
    const pubkey = solanaService.getServerWallet().publicKey.toBase58();
    console.log(`   ✅ PASS — Sender wallet: ${pubkey}`);
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

  // Step 3: Check sender ephemeral balance before transfer
  console.log('📋 Step 3: Sender Ephemeral Balance Before Transfer');
  let ephemeralBefore = 0;
  try {
    ephemeralBefore = await solanaService.getMagicblockPrivateBalance(USDC_DEVNET_MINT);
    const uiBefore = ephemeralBefore / 1_000_000;
    console.log(`   Sender PER balance: ${ephemeralBefore} base units (${uiBefore} USDC)`);
  } catch (error) {
    console.warn(`   ⚠️ Could not fetch balance: ${error.message}`);
    console.log('   Will attempt transfer anyway (may auto-deposit).');
  }
  console.log();

  // Step 4: Transfer
  console.log('📋 Step 4: Private Transfer');
  const transferAmount = 0.1; // 0.1 USDC
  console.log(`   Transferring ${transferAmount} USDC to ${recipientAddress}...`);
  console.log('   (If insufficient PER balance, auto-deposit will occur first)');
  try {
    const sig = await solanaService.transferMagicblock(recipientAddress, transferAmount, USDC_DEVNET_MINT);
    console.log(`   ✅ PASS — Transfer signature: ${sig}`);
  } catch (error) {
    console.error(`   ❌ FAIL — ${error.message}`);
    if (error.response) console.error(`   API Response:`, error.response.data);
    if (error.message.includes('Private Ephemeral Rollup')) {
      console.log('   💡 The recipient must deposit USDC into the PER before receiving private transfers.');
    }
    process.exit(1);
  }
  console.log();

  // Step 5: Check sender ephemeral balance after transfer
  console.log('📋 Step 5: Sender Ephemeral Balance After Transfer');
  try {
    const ephemeralAfter = await solanaService.getMagicblockPrivateBalance(USDC_DEVNET_MINT);
    const uiAfter = ephemeralAfter / 1_000_000;
    console.log(`   Sender PER balance: ${ephemeralAfter} base units (${uiAfter} USDC)`);
    const diff = ephemeralBefore - ephemeralAfter;
    console.log(`   Sender decrease: ${diff} base units (expected ~${transferAmount * 1_000_000})`);
  } catch (error) {
    console.warn(`   ⚠️ Could not fetch balance: ${error.message}`);
  }
  console.log();

  console.log('='.repeat(60));
  console.log('  Transfer test complete.');
  console.log('='.repeat(60));
}

run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
