/**
 * Simple test script to verify API endpoints
 * This is just a basic test - in a real scenario, you'd want more comprehensive tests
 */

const axios = require('axios');

// Update these with your test configuration
const API_BASE_URL = 'http://localhost:3000';
const UNITY_VALIDATION_TOKEN = process.env.UNITY_VALIDATION_TOKEN || 'test-token';

async function testApi() {
  console.log('Testing KillersArena Reward Distribution API...\n');

  // Test 1: Health check
  try {
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${API_BASE_URL}/health`);
    console.log('✅ Health check passed:', healthResponse.data);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
  }

  // Test 2: Try to access balance (should fail without proper validation)
  try {
    console.log('\n2. Testing balance endpoint without validation (should fail)...');
    await axios.get(`${API_BASE_URL}/balance`);
    console.log('❌ Balance check should have failed without validation');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Balance check correctly failed with 401 unauthorized');
    } else {
      console.log('❌ Balance check failed with unexpected error:', error.message);
    }
  }

  // Test 3: Try to access balance with validation (will fail due to missing token configuration)
  try {
    console.log('\n3. Testing balance endpoint with validation header...');
    const balanceResponse = await axios.get(`${API_BASE_URL}/balance`, {
      headers: {
        'X-Unity-Validation': UNITY_VALIDATION_TOKEN
      }
    });
    console.log('✅ Balance check passed:', balanceResponse.data);
  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 500)) {
      console.log('⚠️ Balance check failed as expected (likely due to missing/invalid environment configuration):', error.response.data);
    } else {
      console.log('❌ Balance check failed with unexpected error:', error.message);
    }
  }

  // Test 4: Try single distribution endpoint (should fail without validation)
  try {
    console.log('\n4. Testing distribute endpoint without validation (should fail)...');
    await axios.post(`${API_BASE_URL}/distribute`, {
      address: 'test_address_here',
      amount: 10
    });
    console.log('❌ Distribute should have failed without validation');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Distribute correctly failed with 401 unauthorized');
    } else {
      console.log('❌ Distribute failed with unexpected error:', error.message);
    }
  }

  // Test 5: Try batch distribution endpoint (should fail without validation)
  try {
    console.log('\n5. Testing distribute-batch endpoint without validation (should fail)...');
    await axios.post(`${API_BASE_URL}/distribute-batch`, [
      { address: 'test_address_1', amount: 5 },
      { address: 'test_address_2', amount: 10 }
    ]);
    console.log('❌ Distribute-batch should have failed without validation');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Distribute-batch correctly failed with 401 unauthorized');
    } else {
      console.log('❌ Distribute-batch failed with unexpected error:', error.message);
    }
  }

  console.log('\n📝 API tests completed. Check that all endpoints are secured properly.');
  console.log('\n⚠️ Note: Some tests may fail due to missing environment configuration.');
  console.log('   Make sure to set up your .env file with proper values before running the server in production.');
}

// Run the test
testApi().catch(console.error);