require('dotenv').config();
const SolanaService = require('../utils/solana');
const { PublicKey } = require('@solana/web3.js');

async function check() {
    try {
        console.log('Initializing SolanaService...');
        const solanaService = new SolanaService();
        const mintAddress = new PublicKey(process.env.TOKEN_MINT_ADDRESS);

        console.log('Mint:', mintAddress.toBase58());

        // Test getMintDecimals
        const decimals = await solanaService.getMintDecimals(mintAddress);
        console.log('Decimals:', decimals);

        const amount = 100;
        const adjustedAmount = Math.floor(amount * Math.pow(10, decimals));
        console.log(`Original Amount: ${amount}`);
        console.log(`Adjusted Amount: ${adjustedAmount}`);

        if (decimals === 6 && adjustedAmount === 100000000) {
            console.log('✅ Calculation is correct for 6 decimals');
        } else {
            console.log('⚠️ Verify calculation manually');
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

check();
