require('dotenv').config();
const { Connection, Keypair, PublicKey, SystemProgram, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createSyncNativeInstruction } = require('@solana/spl-token');

async function test() {
    const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    const privateKeyArray = JSON.parse(process.env.SERVER_WALLET_PRIVATE_KEY);
    const serverWallet = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

    try {
        const ata = await getAssociatedTokenAddress(WSOL_MINT, serverWallet.publicKey);
        console.log("WSOL ATA:", ata.toBase58());

        const info = await connection.getAccountInfo(ata);
        const tx = new Transaction();

        if (!info) {
            console.log("Creating WSOL ATA...");
            tx.add(createAssociatedTokenAccountInstruction(
                serverWallet.publicKey,
                ata,
                serverWallet.publicKey,
                WSOL_MINT
            ));
        }

        console.log("Wrapping 2 SOL...");
        tx.add(SystemProgram.transfer({
            fromPubkey: serverWallet.publicKey,
            toPubkey: ata,
            lamports: 2000000000
        }));
        tx.add(createSyncNativeInstruction(ata));

        const sig = await connection.sendTransaction(tx, [serverWallet]);
        console.log("Tx signature:", sig);
        await connection.confirmTransaction(sig);
        console.log("Done. WSOL ATA funded.");

    } catch (e) {
        console.error("Failed:", e.message);
    }
}
test();
