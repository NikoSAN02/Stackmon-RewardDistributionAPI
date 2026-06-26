const app = require('../server');
const axios = require('axios');
const http = require('http');

const PORT = 3004;
const server = http.createServer(app);

async function testUpdateGameStats() {
    server.listen(PORT, async () => {
        console.log(`Test server running on port ${PORT}`);

        try {
            const walletAddress = '5dwFkdo8Ank3vtr6iaBi3jpMh5KCxaMZqP1NY3g4ekQD';
            const roomId = `room_gs_${Date.now()}`;
            const depositAmount = 250;

            // 1. Setup: INSERT a record first
            const header = { headers: { 'X-Unity-Validation': 'KillerArenaUnityToken2025' } };
            await axios.post(`http://localhost:${PORT}/recordUserData`, {
                walletAddress, depositAmount, roomId
            }, header);
            console.log('Setup: Record inserted.');

            // 2. Test valid UpdateGameStats
            const updatePayload = {
                walletAddress,
                depositAmount, // Key 2
                roomId,        // Key 3
                kills: 10,
                rewards: 150
            };

            console.log('--- Testing /UpdateGameStats (Valid) ---');
            const response = await axios.post(`http://localhost:${PORT}/UpdateGameStats`, updatePayload, header);

            console.log('Status:', response.status);
            if (response.status === 200 && response.data.data.kills === 10) {
                console.log('TEST PASSED: Game stats updated correctly.');
            } else {
                console.error('TEST FAILED: Data mismatch', response.data);
            }

            // 3. Test Invalid Key (Wrong Deposit Amount)
            console.log('\n--- Testing /UpdateGameStats (Invalid Key) ---');
            try {
                await axios.post(`http://localhost:${PORT}/UpdateGameStats`, {
                    ...updatePayload,
                    depositAmount: 999 // Wrong amount
                }, header);
            } catch (err) {
                if (err.response && err.response.status === 404) {
                    console.log('TEST PASSED: Correctly returned 404 for non-matching record.');
                } else {
                    console.error('TEST FAILED: Expected 404, got', err.response ? err.response.status : err.message);
                }
            }

        } catch (error) {
            console.error('TEST CRITICAL FAILURE:', error.message);
            if (error.response) console.error(error.response.data);
        } finally {
            server.close();
            process.exit(0);
        }
    });
}

testUpdateGameStats();
