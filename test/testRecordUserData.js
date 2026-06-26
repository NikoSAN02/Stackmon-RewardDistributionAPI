const app = require('../server');
const axios = require('axios');
const http = require('http');

const PORT = 3003;
const server = http.createServer(app);

async function testUserStatsFlow() {
    server.listen(PORT, async () => {
        console.log(`Test server running on port ${PORT}`);

        try {
            const walletAddress = '5dwFkdo8Ank3vtr6iaBi3jpMh5KCxaMZqP1NY3g4ekQD';
            const roomId = `room_${Date.now()}`; // Unique room to avoid collisions

            // 1. Test INSERT
            const insertPayload = {
                walletAddress: walletAddress,
                depositAmount: 100,
                roomId: roomId
            };

            const headers = {
                'Content-Type': 'application/json',
                'X-Unity-Validation': 'KillerArenaUnityToken2025'
            };

            console.log('--- Testing INSERT ---');
            const insertResponse = await axios.post(`http://localhost:${PORT}/recordUserData`, insertPayload, { headers });
            console.log('Insert Status:', insertResponse.status);

            if (insertResponse.status !== 201 || !insertResponse.data.success) {
                throw new Error('Insert failed');
            }
            console.log('Insert Success. ID:', insertResponse.data.data.id);

            // 2. Test UPDATE
            const updatePayload = {
                walletAddress: walletAddress,
                roomId: roomId,
                kills: 5,
                rewards: 50,
                transactionHash: 'tx_hash_example_123'
            };

            console.log('\n--- Testing UPDATE ---');
            const updateResponse = await axios.put(`http://localhost:${PORT}/recordUserData`, updatePayload, { headers });
            console.log('Update Status:', updateResponse.status);
            console.log('Update Data:', updateResponse.data);

            if (updateResponse.status === 200 &&
                updateResponse.data.success &&
                updateResponse.data.data.kills === 5) {
                console.log('TEST PASSED: User data flow (Insert -> Update) successful.');
            } else {
                console.error('TEST FAILED: Update validation failed.');
            }

        } catch (error) {
            if (error.response) {
                console.error('TEST FAILED: Server returned error:', error.response.status, error.response.data);
            } else {
                console.error('TEST FAILED: Request error:', error.message);
            }
        } finally {
            server.close();
            process.exit(0);
        }
    });
}

testUserStatsFlow();
