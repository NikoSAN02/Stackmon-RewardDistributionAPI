# Reward Distribution API - Implementation "Know How"

This document explains **how the project is built** to help you replicate it for other blockchains.

## 1. Architecture Overview

The project follows a standard **Layered Architecture**:
1.  **API Layer (`server.js`, `routes`)**: Handles HTTP requests, rate limiting, and security headers.
2.  **Controller Layer (`controllers/`)**: Validates input and orchestrates the flow.
3.  **Service Layer (`services/`)**: Contains the business logic and blockchain interactions. **This is the main part to change for a different chain.**
4.  **Middleware (`middleware/`)**: Handles cross-cutting concerns like Authentication (Unity Validation).

## 2. Key Components & Porting Logic

### A. Entry Point (`server.js`)
- **Role**: Sets up Express, Middleware (CORS, Helmet, RateLimit), and Routes.
- **Porting**: Mostly reusable. You might change the port or specific middleware config, but the structure remains the same.

### B. Security (`middleware/unityValidation.js`)
- **Role**: Verifies that requests come from your authorized Game Client (Unity).
- **Mechanism**: Checks for a specific header (`X-Unity-Validation`) matching a secret token in `.env`.
- **Porting**: **100% Reusable**. This logic is chain-agnostic.

### C. The Core: Token Service (`services/tokenService.js`)
**This is where the magic happens and what you need to rewrite for a different chain.**

- **Current Implementation (Solana)**:
    - Uses `@solana/web3.js` and `@solana/spl-token`.
    - Manages a `Keypair` (Server Wallet).
    - Functions:
        - `transferTokens(recipient, amount)`: Handles the logic of creating a transaction, signing it, and sending it to the network.
        - `getBalance()`: Checks server wallet balance.
- **Porting Strategy**:
    - **Interface**: Keep the method signatures same (`transferTokens`, `getBalance`) so the Controller doesn't need to change.
    - **Implementation**: Replace Solana logic with the target chain's library (e.g., `ethers.js` or `viem` for EVM chains like Ethereum, Polygon, BSC).
    - **Gas Management**: Solana fees are low/handled differently. For EVM, you'll need to handle Gas Limit and Gas Price/EIP-1559 fees.

### D. Configuration (`.env`)
- **Current**: `SOLANA_RPC_URL`, `TOKEN_MINT_ADDRESS`, `SERVER_WALLET_PRIVATE_KEY`.
- **Porting**: You will need equivalent variables for the new chain:
    - `RPC_URL` (e.g., Infura/Alchemy endpoint)
    - `CONTRACT_ADDRESS` (Token Contract Address)
    - `PRIVATE_KEY` (Wallet Private Key)

## 3. Step-by-Step Porting Guide

To build this for a different chain (e.g., Polygon):

1.  **Copy the Project**: Duplicate the entire folder.
2.  **Update Dependencies**:
    - Remove: `@solana/web3.js`, `@solana/spl-token`.
    - Add: `ethers` (or `viem`, `web3.js`).
3.  **Rewrite `services/tokenService.js`**:
    - Initialize the Provider (RPC connection) and Wallet (Signer) using the new library.
    - Rewrite `transferTokens` to create an EVM transaction (ERC-20 `transfer` function call).
4.  **Update `.env`**: Set the new Chain's RPC URL and Token Address.
5.  **Test**: The API endpoints (`/distribute`) should work exactly the same way if you kept the Service method signatures identical.

## 4. Summary for AI Assistant
When you ask an AI to "do similar things for a different chain", provide:
1.  **This Documentation**.
2.  **The Target Chain Name** (e.g., "Polygon", "Binance Smart Chain").
3.  **The Library Preference** (optional, e.g., "Use ethers.js v6").

The AI will then know to swap out the **Service Layer** while keeping the robust API and Security structure intact.
