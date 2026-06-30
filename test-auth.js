require('dotenv').config();
const SolanaService = require('./utils/solana');

async function run() {
  console.log('='.repeat(60));
  console.log('  Test: Magicblock Authentication');
  console.log('='.repeat(60));
  console.log();

  // Test 1: Initialize SolanaService
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

  // Test 2: Magicblock Authentication
  console.log('📋 Step 2: Magicblock Authentication (challenge → sign → login)');
  try {
    const token = await solanaService.getMagicblockAuthToken();
    console.log(`   ✅ PASS — Got auth token (${token.substring(0, 20)}...)`);

    const startCache = Date.now();
    const cachedToken = await solanaService.getMagicblockAuthToken();
    const cacheMs = Date.now() - startCache;
    console.log(`   ✅ PASS — Cached token returned in ${cacheMs}ms (match: ${token === cachedToken})`);
  } catch (error) {
    console.error(`   ❌ FAIL — ${error.message}`);
    if (error.response) {
      console.error(`   API Response:`, error.response.data);
    }
    process.exit(1);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('  Auth test complete.');
  console.log('='.repeat(60));
}

run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
