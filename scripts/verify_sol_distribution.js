const TokenService = require('../services/tokenService');
const logger = require('../utils/logger');

// Mock SolanaService
const mockSolanaService = {
    isValidSolanaAddress: (addr) => true,
    getSolBalance: async () => 1.5, // 1.5 SOL balance
    transferSol: async (recipient, amount) => {
        console.log(`[MOCK] Transferring ${amount} SOL to ${recipient}`);
        return 'mock_signature_12345';
    }
};

async function verifySolDistribution() {
    console.log('--- Starting SOL Distribution Verification ---');

    try {
        const tokenService = new TokenService();
        // Inject mock service
        tokenService.solanaService = mockSolanaService;

        const recipient = 'Dm1X2...MockAddress';
        const amount = 0.1;

        console.log(`Attempting to transfer ${amount} SOL to ${recipient}...`);
        const signature = await tokenService.transferTokens(recipient, amount);

        if (signature === 'mock_signature_12345') {
            console.log('✅ Verification SUCCEEDED: transferTokens called transferSol correctly.');
        } else {
            console.error('❌ Verification FAILED: Unexpected signature returned.');
        }

    } catch (error) {
        console.error('❌ Verification FAILED with error:', error);
    }
}

verifySolDistribution();
