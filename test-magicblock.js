const fetch = require('node-fetch'); // Let's use fetch or axios. Assuming fetch is available in Node > 18 or installed.

async function test() {
    try {
        const payload = {
            "from": "3rXKwQ1kpjBd5tdcco32qsvqUh1BnZjcYnS5kYrP7AYE", // Dummy address
            "to": "Bt9oNR5cCtnfuMmXgWELd6q5i974PdEMQDUE55nBC57L", // Dummy address
            "mint": "So11111111111111111111111111111111111111112",
            "amount": 1000000,
            "visibility": "public",
            "fromBalance": "base",
            "toBalance": "base",
            "cluster": "devnet",
            "wrapAndUnwrapSol": true
        };
        const response = await fetch('https://payments.magicblock.app/v1/spl/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

test();
