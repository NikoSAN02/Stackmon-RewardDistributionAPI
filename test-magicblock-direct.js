require('dotenv').config();
const SolanaService = require('./utils/solana');

async function test() {
    const service = new SolanaService();
    try {
        console.log("Calling transferMagicblock...");
        const sig = await service.transferMagicblock("AuWuUtHcWcLwhzwABrwkjDWijvYeE17Apf3PBeXeRSCm", 1);
        console.log("Success! Sig:", sig);
    } catch (e) {
        console.error("Failed:", e.message);
    }
}
test();
