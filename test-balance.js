require('dotenv').config();
const { PublicKey } = require('@solana/web3.js');
const { getOrCreateAssociatedTokenAccount } = require('@solana/spl-token');
const SolanaService = require('./utils/solana');

const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

async function run() {
  console.log('='.repeat(60));
  console.log('  Test: Magicblock Balance Check');
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

  // Step 3: Private (ephemeral) balance
  console.log('📋 Step 3: Private Ephemeral USDC Balance');
  try {
    const balance = await solanaService.getMagicblockPrivateBalance(USDC_DEVNET_MINT);
    const uiBalance = balance / 1_000_000;
    console.log(`   ✅ PASS — Ephemeral balance: ${balance} base units (${uiBalance} USDC)`);
  } catch (error) {
    console.warn(`   ⚠️ WARN — ${error.message}`);
    if (error.response) console.warn(`   API:`, error.response.data);
    console.log('   (Expected if wallet has never deposited into PER)');
  }
  console.log();

  // Step 4: Base (on-chain) USDC balance
  console.log('📋 Step 4: Base On-chain USDC Balance');
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
    console.log(`   ✅ PASS — Base USDC balance: ${balanceInfo.value.uiAmountString} USDC (${balanceInfo.value.amount} base units)`);
    console.log(`   ATA: ${serverATA.address.toBase58()}`);
  } catch (error) {
    console.error(`   ❌ FAIL — ${error.message}`);
  }
  console.log();

  // Step 5: SOL balance
  console.log('📋 Step 5: Server SOL Balance');
  try {
    const solBalance = await solanaService.getSolBalance();
    console.log(`   ✅ PASS — SOL balance: ${solBalance} SOL`);
  } catch (error) {
    console.error(`   ❌ FAIL — ${error.message}`);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('  Balance check complete.');
  console.log('='.repeat(60));
}

run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
