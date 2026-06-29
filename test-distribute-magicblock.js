const crypto = require('crypto');

async function test() {
    try {
        const payload = {
            address: "AuWuUtHcWcLwhzwABrwkjDWijvYeE17Apf3PBeXeRSCm",
            score: 0.1,
            mode: "practice",
            bonus_sol: 0,
            bet_amount: 0
        };

        const response = await fetch('http://127.0.0.1:3001/distribute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Unity-Validation': 'StackMonUnityToken2026'
            },
            body: JSON.stringify(payload)
        });
        const text = await response.text();
        console.log("Status:", response.status);
        console.log("Body:", text);
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
