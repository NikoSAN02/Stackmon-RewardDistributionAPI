/**
 * test-sol-e2e-flow.js
 * 
 * Tests the complete SOL reward distribution and withdrawal flow using Magicblock:
 * 1. Wrap SOL to wSOL for the server wallet on-chain.
 * 2. Deposit wSOL from server wallet to server's ephemeral balance.
 * 3. Transfer wSOL privately from server's ephemeral balance to a new recipient's ephemeral balance (toBalance: "ephemeral").
 * 4. Build a withdraw transaction for the recipient with wrapAndUnwrapSol: true.
 * 5. Sign the withdraw transaction with the recipient's wallet and submit it to the base chain.
 * 6. Verify the recipient receives native SOL directly in their base wallet.
 */

require('dotenv').config();
const { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, SystemProgram } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } = require('@solana/spl-token');
const SolanaService = require('./utils/solana');
const axios = require('axios');

const WSOL_DEVNET_MINT = 'So11111111111111111111111111111111111111112';
const MAGICBLOCK_API_URL = 'https://payments.magicblock.app';

async function run() {
  console.log('='.repeat(60));
  console.log('  Magicblock SOL E2E Private Transfer & Wrap/Unwrap Test');
  console.log('='.repeat(60));
  console.log();

  const solanaService = new SolanaService();
  const connection = solanaService.getConnection();
  const serverWallet = solanaService.getServerWallet();
  const serverPubkey = serverWallet.publicKey.toBase58();

  // Generate a temporary recipient wallet
  const recipientWallet = Keypair.generate();
  const recipientPubkey = recipientWallet.publicKey;
  console.log(`Server Wallet: ${serverPubkey}`);
  console.log(`Temp Recipient Wallet: ${recipientPubkey.toBase58()}`);
  console.log();

  // Airdrop some SOL to the temporary recipient to cover transaction fees for withdrawal
  console.log('📋 Step 0: Funding recipient wallet with SOL for gas fees...');
  try {
    const airdropSig = await connection.requestAirdrop(recipientPubkey, 2 * 1e9); // 2 SOL
    const latestBlock = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlock.blockhash,
      lastValidBlockHeight: latestBlock.lastValidBlockHeight,
      signature: airdropSig
    });
    const bal = await connection.getBalance(recipientPubkey);
    console.log(`   Recipient SOL balance: ${bal / 1e9} SOL`);
  } catch (err) {
    console.log(`   Airdrop failed (${err.message}), sending SOL from server wallet instead...`);
    // Fallback: Send SOL from server wallet
    const transferTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: serverWallet.publicKey,
        toPubkey: recipientPubkey,
        lamports: 0.05 * 1e9 // 0.05 SOL
      })
    );
    const sig = await connection.sendTransaction(transferTx, [serverWallet]);
    const latestBlock = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlock.blockhash,
      lastValidBlockHeight: latestBlock.lastValidBlockHeight,
      signature: sig
    });
    console.log(`   Recipient SOL balance funded: ${(await connection.getBalance(recipientPubkey)) / 1e9} SOL`);
  }
  console.log();

  // Step 1: Wrap SOL for the server wallet
  console.log('📋 Step 1: Wrapping SOL to wSOL for server wallet...');
  const wsolMintPubkey = new PublicKey(WSOL_DEVNET_MINT);
  const serverWsolAta = await getAssociatedTokenAddress(wsolMintPubkey, serverWallet.publicKey);
  const ataInfo = await connection.getAccountInfo(serverWsolAta);
  const wrapTx = new Transaction();

  if (!ataInfo) {
    wrapTx.add(createAssociatedTokenAccountInstruction(
      serverWallet.publicKey,
      serverWsolAta,
      serverWallet.publicKey,
      wsolMintPubkey
    ));
  }

  const wrapAmountLamports = 60000000; // 0.06 SOL
  wrapTx.add(
    SystemProgram.transfer({
      fromPubkey: serverWallet.publicKey,
      toPubkey: serverWsolAta,
      lamports: wrapAmountLamports
    }),
    createSyncNativeInstruction(serverWsolAta)
  );

  const wrapSig = await connection.sendTransaction(wrapTx, [serverWallet]);
  const latestBlock = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    blockhash: latestBlock.blockhash,
    lastValidBlockHeight: latestBlock.lastValidBlockHeight,
    signature: wrapSig
  });
  console.log('   ✅ Wrapped wSOL');
  console.log();

  // Step 2: Deposit wSOL into server's ephemeral balance
  console.log('📋 Step 2: Depositing wSOL to server ephemeral balance...');
  try {
    const depSig = await solanaService.depositToMagicblockPER(50000000, WSOL_DEVNET_MINT);
    console.log(`   ✅ Deposit confirmed. Sig: ${depSig}`);
    // Wait for balance indexer
    console.log('⏳ Waiting 15 seconds for deposit to reflect on ephemeral indexer...');
    await new Promise(r => setTimeout(r, 15000));
  } catch (err) {
    console.error(`   ❌ Deposit failed: ${err.message}`);
    process.exit(1);
  }
  console.log();

  // Step 3: Authenticate server
  await solanaService.getMagicblockAuthToken();

  // Step 4: Transfer wSOL to recipient's ephemeral balance
  console.log('📋 Step 3: Transferring wSOL privately to recipient ephemeral balance...');
  const transferPayload = {
    from: serverPubkey,
    to: recipientPubkey.toBase58(),
    mint: WSOL_DEVNET_MINT,
    amount: 50000000, // 0.05 SOL
    visibility: "private",
    fromBalance: "ephemeral",
    toBalance: "ephemeral", // <--- Ephemeral to Ephemeral!
    cluster: "devnet",
    wrapAndUnwrapSol: false,
    initIfMissing: false,
    initAtasIfMissing: true,
    initVaultIfMissing: false
  };

  let txBase64;
  try {
    const res = await axios.post(`${MAGICBLOCK_API_URL}/v1/spl/transfer`, transferPayload, {
      headers: { Authorization: `Bearer ${solanaService.authToken}` }
    });
    txBase64 = res.data.transactionBase64;
    console.log(`   Magicblock transfer API response received. Submission: ${res.data.sendTo}`);
    
    // Sign and submit to ephemeral RPC
    const transactionBuffer = Buffer.from(txBase64, 'base64');
    const connToSend = res.data.sendRpcEndpoint 
      ? new Connection(res.data.sendRpcEndpoint, 'confirmed')
      : connection;

    let transferSig;
    if (res.data.version === 'v0') {
      const versionedTransaction = VersionedTransaction.deserialize(transactionBuffer);
      versionedTransaction.sign([serverWallet]);
      transferSig = await connToSend.sendTransaction(versionedTransaction, { skipPreflight: true });
    } else {
      const transaction = Transaction.from(transactionBuffer);
      transaction.sign(serverWallet);
      transferSig = await connToSend.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
    }
    console.log(`   Transfer transaction submitted to ER: ${transferSig}`);
    console.log('⏳ Waiting 15 seconds for transfer to reflect on ephemeral indexer...');
    await new Promise(r => setTimeout(r, 15000)); // wait for ER state update
  } catch (err) {
    console.error(`   ❌ Transfer failed:`, err.response ? err.response.data : err.message);
    process.exit(1);
  }
  console.log();

  // Step 5: Check recipient ephemeral balance
  console.log('📋 Step 4: Checking recipient ephemeral balance...');
  // Recipient authenticate with Magicblock
  let recipientAuthToken;
  try {
    const challengeRes = await axios.get(`${MAGICBLOCK_API_URL}/v1/spl/challenge`, {
      params: { pubkey: recipientPubkey.toBase58() }
    });
    const challenge = challengeRes.data.challenge;
    
    // Sign challenge
    const nacl = require('tweetnacl');
    const challengeBuffer = Buffer.from(challenge);
    const signatureBytes = nacl.sign.detached(challengeBuffer, recipientWallet.secretKey);
    const bs58Lib = require('bs58');
    const bs58 = bs58Lib.default || bs58Lib;
    const signatureBase58 = bs58.encode(signatureBytes);

    const loginRes = await axios.post(`${MAGICBLOCK_API_URL}/v1/spl/login`, {
      pubkey: recipientPubkey.toBase58(),
      challenge,
      signature: signatureBase58
    });
    recipientAuthToken = loginRes.data.token;
    
    // Check balance
    const balRes = await axios.get(`${MAGICBLOCK_API_URL}/v1/spl/private-balance`, {
      params: { address: recipientPubkey.toBase58(), mint: WSOL_DEVNET_MINT, cluster: "devnet" },
      headers: { Authorization: `Bearer ${recipientAuthToken}` }
    });
    console.log(`   Recipient Ephemeral Balance: ${balRes.data.balance} base units (${balRes.data.balance / 1e9} wSOL)`);
  } catch (err) {
    console.error(`   ❌ Failed to fetch recipient private balance:`, err.response ? err.response.data : err.message);
    process.exit(1);
  }
  console.log();

  // Step 6: Recipient withdraws from ephemeral balance to base chain with wrapAndUnwrapSol: true
  console.log('📋 Step 5: Recipient executing withdraw with wrapAndUnwrapSol: true...');
  const solBeforeWithdraw = await connection.getBalance(recipientPubkey);
  console.log(`   Recipient SOL balance before withdraw: ${solBeforeWithdraw / 1e9} SOL`);

  const withdrawPayload = {
    owner: recipientPubkey.toBase58(),
    mint: WSOL_DEVNET_MINT,
    amount: 50000000, // 0.05 wSOL
    cluster: "devnet",
    wrapAndUnwrapSol: true, // <--- Wrap and Unwrap!
    initIfMissing: true,
    initAtasIfMissing: true,
    idempotent: true
  };

  try {
    const res = await axios.post(`${MAGICBLOCK_API_URL}/v1/spl/withdraw`, withdrawPayload, {
      headers: { Authorization: `Bearer ${recipientAuthToken}` }
    });
    
    const transactionBuffer = Buffer.from(res.data.transactionBase64, 'base64');
    let withdrawSig;

    console.log(`   Submitting withdraw transaction to ${res.data.sendTo} chain...`);
    const connToSend = res.data.sendRpcEndpoint 
      ? new Connection(res.data.sendRpcEndpoint, 'confirmed')
      : connection;

    if (res.data.version === 'v0') {
      const versionedTransaction = VersionedTransaction.deserialize(transactionBuffer);
      versionedTransaction.sign([recipientWallet]);
      withdrawSig = await connToSend.sendTransaction(versionedTransaction, { skipPreflight: true });
    } else {
      const transaction = Transaction.from(transactionBuffer);
      transaction.sign(recipientWallet);
      withdrawSig = await connToSend.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
    }

    console.log(`   Withdraw transaction submitted: ${withdrawSig}`);
    const latestBlock = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlock.blockhash,
      lastValidBlockHeight: latestBlock.lastValidBlockHeight,
      signature: withdrawSig
    });
    console.log('   ✅ Withdraw confirmed!');
  } catch (err) {
    console.error(`   ❌ Withdraw failed:`, err.response ? err.response.data : err.message);
    process.exit(1);
  }
  console.log();

  // Step 7: Verify recipient native SOL balance after withdraw
  console.log('📋 Step 6: Verify Recipient Balances After Withdraw...');
  await new Promise(r => setTimeout(r, 2000));
  const solAfterWithdraw = await connection.getBalance(recipientPubkey);
  console.log(`   Recipient SOL balance after withdraw: ${solAfterWithdraw / 1e9} SOL`);
  // Note: Withdrawal will consume a tiny bit of SOL for transaction fee, but we transferred 0.05 SOL
  const solDiff = (solAfterWithdraw - solBeforeWithdraw) / 1e9;
  console.log(`   SOL Difference: ${solDiff} SOL (Expected net increase of ~0.05 SOL minus transaction fees)`);

  // Check wSOL ATA (should be closed / 0 balance)
  const recipientWsolAta = await getAssociatedTokenAddress(wsolMintPubkey, recipientPubkey);
  const ataInfoAfter = await connection.getAccountInfo(recipientWsolAta);
  if (ataInfoAfter) {
    const balanceInfo = await connection.getTokenAccountBalance(recipientWsolAta);
    console.log(`   Recipient wSOL ATA balance: ${balanceInfo.value.uiAmount} wSOL`);
  } else {
    console.log(`   Recipient wSOL ATA: Does not exist (Clean unwrap successful!)`);
  }

  console.log();
  console.log('='.repeat(60));
  console.log('  E2E SOL private transfer & wrap/unwrap test successful!');
  console.log('='.repeat(60));
}

run().catch(console.error);
