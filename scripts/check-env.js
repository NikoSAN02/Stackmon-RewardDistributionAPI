require('dotenv').config();
const SolanaService = require('../utils/solana');
const { PublicKey } = require('@solana/web3.js');

async function check() {
    try {
        console.log('Initializing SolanaService...');
        const solanaService = new SolanaService();
        const mintAddress = new PublicKey(process.env.TOKEN_MINT_ADDRESS);

        console.log('Mint:', mintAddress.toBase58());

        // Test getMintProgramId
        const programId = await solanaService.getMintProgramId(mintAddress);
        console.log('Program ID:', programId.toBase58());

        // Test getServerTokenBalance (which uses createAssociatedTokenAccount internally)
        console.log('Getting Token Balance...');
        const tokenBalance = await solanaService.getServerTokenBalance(mintAddress);
        console.log('Token Balance:', tokenBalance);

    } catch (error) {
        console.error('Error:', error);
    }
}

check();
