require('dotenv').config();
const SolanaService = require('./utils/solana');
const axios = require('axios');
const { Transaction, VersionedTransaction } = require('@solana/web3.js');

async function test() {
    const service = new SolanaService();
    try {
        console.log("Calling Magicblock API...");
        const payload = {
            from: service.serverWallet.publicKey.toBase58(),
            to: "AuWuUtHcWcLwhzwABrwkjDWijvYeE17Apf3PBeXeRSCm",
            mint: "So11111111111111111111111111111111111111112",
            amount: 1000000000,
            visibility: "private",
            fromBalance: "base",
            toBalance: "base",
            cluster: "devnet",
            wrapAndUnwrapSol: true
        };

        const response = await axios.post('https://payments.magicblock.app/v1/spl/transfer', payload);
        const transactionBuffer = Buffer.from(response.data.transactionBase64, 'base64');
        
        let tx;
        if (response.data.version === 'v0') {
            tx = VersionedTransaction.deserialize(transactionBuffer);
            console.log("Versioned tx instructions:");
            // We can't easily inspect v0 instructions without compiling them, but let's see signatures
            console.log(tx.message.compiledInstructions);
        } else {
            tx = Transaction.from(transactionBuffer);
            console.log("Legacy tx instructions:");
            console.log(tx.instructions.map(ix => ({
                programId: ix.programId.toBase58(),
                keys: ix.keys.map(k => ({pubkey: k.pubkey.toBase58(), isSigner: k.isSigner, isWritable: k.isWritable})),
            })));
        }
    } catch (e) {
        console.error("Failed:", e.response ? e.response.data : e.message);
    }
}
test();
