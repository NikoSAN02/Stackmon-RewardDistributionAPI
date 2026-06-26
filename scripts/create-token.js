const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} = require('@solana/web3.js');
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
  TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');
const bs58 = require('bs58');

/**
 * Script to create an SPL20 token on Solana devnet
 * This script will:
 * 1. Connect to Solana devnet
 * 2. Create a new token mint
 * 3. Mint some tokens to an initial account
 */

async function createToken() {
  // Connect to Solana devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  
  console.log('🚀 Connecting to Solana devnet...');
  
  // Get the keypair from environment or create a new one
  let payer;
  if (process.env.DEVNET_WALLET_PRIVATE_KEY) {
    const secretKey = bs58.decode(process.env.DEVNET_WALLET_PRIVATE_KEY);
    payer = Keypair.fromSecretKey(secretKey);
    console.log(`✅ Using provided wallet: ${payer.publicKey.toBase58()}`);
  } else {
    payer = Keypair.generate();
    console.log(`⚠️ Using generated wallet for testing: ${payer.publicKey.toBase58()}`);
    console.log('📝 NOTE: This is for testing only. Fund this wallet with devnet SOL first.');
    
    // Request some devnet SOL (this only works for devnet and testnet)
    console.log('💰 Requesting devnet SOL for transaction fees...');
    await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    console.log('✅ Devnet SOL airdropped');
  }
  
  // Check if we have sufficient funds
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`💰 Wallet balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log('❌ Insufficient balance. Please fund your wallet with some SOL for transaction fees.');
    return;
  }
  
  console.log('\n🪙 Creating $KILL SPL20 token...');
  
  try {
    // Create new token mint
    const tokenMint = await createMint(
      connection,
      payer,           // payer (to fund the transaction)
      payer.publicKey, // authority that can mint new tokens
      null,            // authority that can freeze token accounts (null for no freeze authority)
      9,               // decimals
      undefined,       // keypair for the new mint (use default)
      undefined,       // confirm options
      TOKEN_PROGRAM_ID // token program id
    );

    console.log(`✅ Token created successfully!`);
    console.log(`🪙 Token Mint Address: ${tokenMint.toBase58()}`);
    
    // Create associated token account for the payer
    console.log('\n🏦 Creating associated token account...');
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      tokenMint,
      payer.publicKey
    );
    console.log(`✅ Token Account: ${tokenAccount.address.toBase58()}`);
    
    // Mint some tokens to the payer's account (for testing)
    console.log('\n🪄 Minting initial tokens...');
    const mintAmount = 1000000000000000; // 1,000,000 tokens with 9 decimals
    await mintTo(
      connection,
      payer,
      tokenMint,
      tokenAccount.address,
      payer.publicKey, // mint authority
      mintAmount,
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );
    
    console.log(`✅ Minted ${mintAmount / Math.pow(10, 9)} $KILL tokens to the account`);
    console.log(`📊 Token Mint Address: ${tokenMint.toBase58()}`);
    console.log(`📊 Token Account Address: ${tokenAccount.address.toBase58()}`);
    
    // Show final token balance
    const tokenInfo = await connection.getTokenAccountBalance(tokenAccount.address);
    console.log(`📊 Current token balance: ${tokenInfo.value.uiAmountString} $KILL`);
    
    console.log('\n🎉 Token creation completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Add the token mint address to your .env file as TOKEN_MINT_ADDRESS');
    console.log('   2. Fund your server wallet with some of these tokens for distribution');
    console.log('   3. Use the token mint address in your reward distribution API');
    
    return {
      tokenMint: tokenMint.toBase58(),
      tokenAccount: tokenAccount.address.toBase58(),
    };
  } catch (error) {
    console.error('❌ Error creating token:', error);
    throw error;
  }
}

// Run the script if called directly
if (require.main === module) {
  createToken().catch(console.error);
}

module.exports = { createToken };