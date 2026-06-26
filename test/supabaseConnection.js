require('dotenv').config();
const supabase = require('../utils/supabase');

async function testConnection() {
    console.log('Testing Supabase connection...');
    try {
        const { data, error } = await supabase.from('test_table').select('*').limit(1);
        if (error && error.code !== 'PGRST204') { // PGRST204 is 'relation "public.test_table" does not exist' which is expected
            console.log('Connection successful (received expected error for missing table):', error.message);
        } else if (error) {
            console.error('Connection failed:', error);
        } else {
            console.log('Connection successful!');
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

testConnection();
