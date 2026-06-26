const fs = require('fs');
const path = require('path');
const bs58Lib = require('bs58');
const bs58 = bs58Lib.default || bs58Lib;

const INPUT_FILE = path.join(__dirname, '..', 'private_key_input.txt');

function convertKey() {
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`❌ Error: Input file not found: ${INPUT_FILE}`);
        console.log('Please create this file and paste your private key (JSON array or Base58 string) into it.');
        process.exit(1);
    }

    const content = fs.readFileSync(INPUT_FILE, 'utf8').trim();

    if (!content) {
        console.error('❌ Error: Input file is empty.');
        process.exit(1);
    }

    let secretKey;
    let inputType = '';

    // 1. Try JSON Array
    if (content.startsWith('[') && content.endsWith(']')) {
        try {
            const parsed = JSON.parse(content);
            secretKey = Uint8Array.from(parsed);
            inputType = 'JSON Array';
        } catch (e) {
            console.log('Not a valid JSON array, checking other formats...');
        }
    }

    // 2. Try Base58 (if not already parsed)
    if (!secretKey) {
        try {
            secretKey = bs58.decode(content);
            inputType = 'Base58 String';
        } catch (e) {
            console.error('❌ Error: Could not parse key as JSON array or Base58 string.');
            process.exit(1);
        }
    }

    // 3. Convert to Base64
    try {
        const base64Key = Buffer.from(secretKey).toString('base64');

        // Convert to regular array for JSON output
        const regularArray = Array.from(secretKey);

        console.log('\n✅ Conversion Successful!');
        console.log(`Input Type: ${inputType}`);
        console.log('----------------------------------------');
        console.log('Base64 Private Key (for .env):');
        console.log(base64Key);
        console.log('----------------------------------------');
        console.log('JSON Array Private Key (Uint8Array format):');
        // Print compact but readable
        console.log(JSON.stringify(regularArray));
        console.log('----------------------------------------');

        const outputPath = path.join(__dirname, '..', 'output_key.json');
        fs.writeFileSync(outputPath, JSON.stringify(regularArray, null, 2));
        console.log(`✅ key saved to ${outputPath}`);

        console.log('Update your .env file with the Base64 value:');
        console.log(`SERVER_WALLET_PRIVATE_KEY=${base64Key}`);

        // Validate length (Solana keys are 64 bytes)
        if (secretKey.length !== 64) {
            console.warn(`\n⚠️ Warning: Decoded key length is ${secretKey.length} bytes. Solana keys are typically 64 bytes.`);
        }

    } catch (e) {
        console.error('❌ Error during conversion:', e);
    }
}

convertKey();
