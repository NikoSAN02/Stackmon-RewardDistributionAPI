# KillersArena Solana Reward Distribution API

## Overview

The KillersArena Solana Reward Distribution API is an Express.js server that enables secure distribution of SPL20 tokens from a server wallet to user wallets in the KillersArena Unity game. The API includes validation mechanisms to ensure that token distributions only occur from authorized Unity game instances.

## Features

- Secure SPL20 token distribution to Solana wallets
- Unity game validation using headers and IP restrictions
- Support for both single and batch token distributions
- Real-time balance checking for the server wallet
- Comprehensive error handling and validation
- Rate limiting and security best practices

## Prerequisites

- Node.js v14 or higher
- npm or yarn package manager
- Access to a Solana devnet or mainnet-beta RPC endpoint
- SPL20 token mint address
- Server wallet private key with sufficient token balance

## Installation

1. Clone or download the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file based on the `.env.example` and configure your environment variables
4. Start the server:
   ```bash
   npm start
   # or for development with auto-restart:
   npm run dev
   ```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Solana Configuration
SOLANA_NETWORK=devnet                  # Network: devnet, testnet, or mainnet-beta
SOLANA_RPC_URL=https://api.devnet.solana.com  # RPC endpoint URL

# Server Wallet (Private Key - Keep this secure!)
SERVER_WALLET_PRIVATE_KEY="your_private_key_here_as_base58_string"

# Unity Validation Configuration
UNITY_VALIDATION_HEADER="X-Unity-Validation"  # Header name for Unity validation
UNITY_VALIDATION_TOKEN="your_unity_validation_token"  # Secret token for Unity game validation

# IP Restrictions (Optional - leave empty to disable)
ALLOWED_IPS="192.168.1.100,10.0.0.50"  # Comma-separated list of allowed IP addresses

# SPL Token Configuration
TOKEN_MINT_ADDRESS="your_spl_token_mint_address_here"

# Server Configuration
PORT=3000
NODE_ENV=development
```

## API Endpoints

### Health Check
- **GET** `/health`
- Returns server health status

### Get Server Balance
- **GET** `/balance`
- Returns the current token balance in the server wallet
- Requires Unity validation

### Single Token Distribution
- **POST** `/distribute`
- Distributes tokens to a single recipient
- Requires Unity validation

**Request Body:**
```json
{
  "address": "recipient_solana_wallet_address",
  "amount": 100
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reward distributed successfully",
  "data": {
    "recipient": "recipient_solana_wallet_address",
    "amount": 100,
    "transaction": "transaction_signature"
  }
}
```

### Batch Token Distribution
- **POST** `/distribute-batch`
- Distributes tokens to multiple recipients in a single request
- Requires Unity validation

**Request Body:**
```json
[
  {
    "address": "recipient1_solana_wallet_address",
    "amount": 50
  },
  {
    "address": "recipient2_solana_wallet_address",
    "amount": 75
  }
]
```

**Response:**
```json
{
  "success": true,
  "message": "Batch reward distribution completed. 2 successful, 0 failed",
  "data": {
    "totalRequested": 2,
    "successful": 2,
    "failed": 0,
    "results": [
      {
        "address": "recipient1_solana_wallet_address",
        "amount": 50,
        "success": true,
        "transaction": "transaction_signature_1"
      },
      {
        "address": "recipient2_solana_wallet_address",
        "amount": 75,
        "success": true,
        "transaction": "transaction_signature_2"
      }
    ]
  }
}
```

## Unity Game Integration

To call the API from the Unity game, ensure that:

1. The `UNITY_VALIDATION_HEADER` is included in all requests with the correct `UNITY_VALIDATION_TOKEN`
2. If IP restrictions are enabled, include the game server's IP in the `ALLOWED_IPS` list

Example Unity C# code for making API calls:

```csharp
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

public class RewardDistributor : MonoBehaviour 
{
    private const string API_URL = "https://your-api-url.com";
    private const string VALIDATION_TOKEN = "your_unity_validation_token";
    
    public void DistributeReward(string recipientAddress, int amount)
    {
        StartCoroutine(DistributeRewardCoroutine(recipientAddress, amount));
    }
    
    private IEnumerator DistributeRewardCoroutine(string recipientAddress, int amount)
    {
        var rewardData = "{\"address\":\"" + recipientAddress + "\",\"amount\":" + amount + "}";
        
        using (var request = new UnityWebRequest($"{API_URL}/distribute", "POST"))
        {
            byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(rewardData);
            request.uploadHandler = new UploadHandlerRaw(bodyRaw);
            request.downloadHandler = new DownloadHandlerBuffer();
            
            request.SetRequestHeader("Content-Type", "application/json");
            request.SetRequestHeader("X-Unity-Validation", VALIDATION_TOKEN);
            
            yield return request.SendWebRequest();
            
            if (request.result == UnityWebRequest.Result.Success)
            {
                Debug.Log("Reward distributed successfully: " + request.downloadHandler.text);
            }
            else
            {
                Debug.LogError("Error distributing reward: " + request.error);
            }
        }
    }
}
```

## Security Considerations

1. **Private Key Security**: Store the `SERVER_WALLET_PRIVATE_KEY` securely and never expose it in client-side code
2. **Validation Token**: Use a strong, secret validation token and rotate it periodically
3. **IP Restrictions**: If possible, restrict API access to known game server IP addresses
4. **Rate Limiting**: Consider implementing rate limiting to prevent abuse
5. **HTTPS**: Always use HTTPS in production to encrypt data in transit

## Error Handling

The API returns appropriate HTTP status codes:
- `200`: Success
- `400`: Bad request (validation errors)
- `401`: Unauthorized (validation failed)
- `404`: Route not found
- `500`: Internal server error

## Testing

To test the API:

1. Start the server: `npm start`
2. Use a tool like Postman or curl to make requests to the endpoints
3. Remember to include the Unity validation header in all requests

Example curl command:
```bash
curl -X POST http://localhost:3000/distribute \
  -H "Content-Type: application/json" \
  -H "X-Unity-Validation: your_validation_token" \
  -d '{"address":"recipient_address_here","amount":100}'
```

## Deployment

For production deployment:

1. Set `NODE_ENV=production` in your environment
2. Use a process manager like PM2 to keep the server running
3. Set up a reverse proxy with nginx or similar
4. Configure SSL certificates for HTTPS
5. Implement proper monitoring and logging

## Troubleshooting

- **Validation Errors**: Ensure all required fields are provided and formatted correctly
- **Insufficient Balance**: Check that the server wallet has enough tokens for distribution
- **Connection Issues**: Verify the RPC URL is accessible and correct
- **Invalid Addresses**: Confirm that wallet addresses are valid Solana addresses