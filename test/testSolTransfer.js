const axios = require('axios');
const { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } = require('@solana/web3.js');
require('dotenv').config();

// Configuration
const API_URL = 'http://localhost:3000';
const network = process.env.SOLANA_NETWORK || 'devnet';
const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl(network), 'confirmed');

// Test wallet to receive SOL (randomly generated or use your own)
// For this test we can generate one on the fly, but to verify balance changes easily we need its public key.
// Ideally we use a known address, but a random one works for checking "sent" status.
// Let's use a random recipient.
const { Keypair } = require('@solana/web3.js');
const recipient = Keypair.generate();
const recipientAddress = recipient.publicKey.toBase58();

async function testSolTransfer() {
    console.log('🧪 Starting SOL Transfer Test...');
    console.log(`Payer/Server Wallet (from env): (Hidden)`);
    console.log(`Recipient: ${recipientAddress}`);

    try {
        // 1. Get initial balance
        const initialBalance = await connection.getBalance(recipient.publicKey);
        console.log(`💰 Initial Recipient Balance: ${initialBalance / LAMPORTS_PER_SOL} SOL`);

        // 2. Request Transfer via API
        const amountToTransfer = 0.001; // SOL
        console.log(`📤 Requesting transfer of ${amountToTransfer} SOL...`);

        const payload = {
            userWalletAddress: recipientAddress,
            amount: amountToTransfer, // Now interpreted as SOL
            // Add other required fields by validations if any. 
            // Looking at controller, might need valid game data if unityValidation is strict?
            // unityValidationMiddleware checks for 'user-id' header or similar? 
            // Let's check middleware. For now assuming simple visual test if middleware fails.
        };

        // Note: unityValidationMiddleware might block us if we don't mock it or provide headers.
        // The server.js shows: app.post('/distribute', unityValidationMiddleware, ...)
        // we need to bypass or satisfy it.
        // Let's assume we run this test against a running local server.
        // If the user's server is not running, we can't test via HTTP. 
        // Maybe we should just invoke the service directly in a script? 
        // The user's request was "Make the changes", verifying via script calling logic directly is safer/easier than spinning up express.

        // Changing approach: Validate via Service directly to avoid middleware issues/server startup requirement for this script.

        const TokenService = require('../services/tokenService');
        const tokenService = new TokenService();

        console.log('🔄 Invoking TokenService.transferTokens directly...');
        const signature = await tokenService.transferTokens(recipientAddress, amountToTransfer);

        console.log('✅ Transfer successful!');
        console.log(`📝 Signature: ${signature}`);

        // 3. Verify final balance
        // Wait a bit for confirmation just in case (though "confirmed" commitment is used)
        await new Promise(resolve => setTimeout(resolve, 2000));

        const finalBalance = await connection.getBalance(recipient.publicKey);
        console.log(`💰 Final Recipient Balance: ${finalBalance / LAMPORTS_PER_SOL} SOL`);

        const expected = initialBalance + (amountToTransfer * LAMPORTS_PER_SOL);
        // Allow small dust difference if any, but exact match expected for direct transfer
        const diff = finalBalance - initialBalance;
        console.log(`📊 Balance Change: ${diff / LAMPORTS_PER_SOL} SOL`);

        if (Math.abs((diff / LAMPORTS_PER_SOL) - amountToTransfer) < 0.000001) {
            console.log('🎉 VERIFICATION PASSED: Balance increased by correct amount.');
        } else {
            console.error('❌ VERIFICATION FAILED: Balance mismatch.');
        }

    } catch (error) {
        console.error('❌ Test Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
        }
    }
}

testSolTransfer();
