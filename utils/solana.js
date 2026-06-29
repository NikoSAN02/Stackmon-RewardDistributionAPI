const {
  Connection,
  PublicKey,
  Keypair,
  clusterApiUrl,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
  VersionedTransaction,
} = require('@solana/web3.js');
const {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  Account,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  TOKEN_2022_PROGRAM_ID,
  getMint,
} = require('@solana/spl-token');
const bs58Lib = require('bs58');
const bs58 = bs58Lib.default || bs58Lib;
const axios = require('axios');

class SolanaService {
  constructor() {
    // Initialize connection based on network
    const network = process.env.SOLANA_NETWORK || 'devnet';
    const rpcUrl = process.env.SOLANA_RPC_URL || clusterApiUrl(network);

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.network = network;

    // Create server wallet from private key
    if (!process.env.SERVER_WALLET_PRIVATE_KEY) {
      // In development mode, we can create a temporary wallet for testing
      if (process.env.NODE_ENV !== 'production') {
        this.serverWallet = Keypair.generate();
        console.warn('⚠️ WARNING: Using a generated wallet for development. DO NOT use in production!');
        console.log(`📝 Development server wallet address: ${this.serverWallet.publicKey.toBase58()}`);
        console.log('📝 To use a real wallet, set SERVER_WALLET_PRIVATE_KEY in your .env file');
      } else {
        throw new Error('SERVER_WALLET_PRIVATE_KEY is required in environment variables');
      }
    } else {
      try {
        // First, try to parse as JSON array (for array format)
        let secretKey;
        const privateKeyRaw = process.env.SERVER_WALLET_PRIVATE_KEY.trim();

        // 1. Try JSON Array
        if (privateKeyRaw.startsWith('[') && privateKeyRaw.endsWith(']')) {
          try {
            const secretKeyArray = JSON.parse(privateKeyRaw);
            secretKey = new Uint8Array(secretKeyArray);
          } catch (parseError) {
            // Invalid JSON, continue
          }
        }

        // 2. Try Base64
        // A Base64 string for 64 bytes will be around 88 chars and decode to exactly 64 bytes
        if (!secretKey) {
          try {
            const buffer = Buffer.from(privateKeyRaw, 'base64');
            if (buffer.length === 64) {
              secretKey = new Uint8Array(buffer);
            }
          } catch (base64Error) {
            // processing issue, continue
          }
        }

        // 3. Try Base58 (Fallback)
        if (!secretKey) {
          try {
            secretKey = bs58.decode(privateKeyRaw);
          } catch (bs58Error) {
            throw new Error(`Private key format not recognized. Must be JSON array, Base64 string (64 bytes), or Base58 string.`);
          }
        }

        // Final validation
        if (secretKey.length !== 64) {
          throw new Error(`Invalid secret key length: ${secretKey.length} bytes. Expected 64 bytes.`);
        }

        this.serverWallet = Keypair.fromSecretKey(secretKey);
        console.log(`✅ Server wallet initialized: ${this.serverWallet.publicKey.toBase58()}`);
      } catch (error) {
        throw new Error(`Invalid server wallet private key: ${error.message}`);
      }
    }
  }

  /**
   * Get the server wallet keypair
   * @returns {Keypair} Server wallet keypair
   */
  getServerWallet() {
    return this.serverWallet;
  }

  /**
   * Get connection instance
   * @returns {Connection} Solana connection
   */
  getConnection() {
    return this.connection;
  }

  /**
   * Get the Program ID for a Mint address (Token or Token-2022)
   * @param {PublicKey} mintAddress - Mint address
   * @returns {Promise<PublicKey>} Program ID
   */
  async getMintProgramId(mintAddress) {
    try {
      const accountInfo = await this.connection.getAccountInfo(mintAddress);
      if (!accountInfo) {
        throw new Error(`Mint address ${mintAddress.toBase58()} not found on chain`);
      }
      return accountInfo.owner;
    } catch (error) {
      console.error('Error getting mint program ID:', error);
      throw error;
    }
  }

  /**
   * Get the decimals for a Mint address
   * @param {PublicKey} mintAddress - Mint address
   * @returns {Promise<number>} Decimals
   */
  async getMintDecimals(mintAddress) {
    try {
      const programId = await this.getMintProgramId(mintAddress);
      const mintInfo = await getMint(
        this.connection,
        mintAddress,
        'confirmed',
        programId
      );
      return mintInfo.decimals;
    } catch (error) {
      console.error('Error getting mint decimals:', error);
      throw error;
    }
  }

  /**
   * Create associated token account if it doesn't exist
   * @param {PublicKey} tokenMintAddress - SPL token mint address
   * @param {PublicKey} owner - Owner of the token account
   * @returns {Promise<Account>} Token account
   */
  async createAssociatedTokenAccount(tokenMintAddress, owner) {
    try {
      const programId = await this.getMintProgramId(tokenMintAddress);

      const tokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.serverWallet, // Payer
        tokenMintAddress,
        owner,
        true, // Allow owner off curve
        'confirmed',
        undefined,
        programId
      );
      return tokenAccount;
    } catch (error) {
      console.error('Error in createAssociatedTokenAccount:', error);
      throw new Error(`Failed to create associated token account: ${error.message}`);
    }
  }

  /**
   * Check if a wallet address is valid
   * @param {string} address - Wallet address to validate
   * @returns {boolean} True if valid, false otherwise
   */
  isValidSolanaAddress(address) {
    try {
      new PublicKey(address);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get balance of a token account
   * @param {PublicKey} tokenAccount - Token account public key
   * @returns {Promise<number>} Token balance
   */
  async getTokenBalance(tokenAccount) {
    try {
      const accountInfo = await this.connection.getTokenAccountBalance(tokenAccount);
      return accountInfo.value.uiAmount || 0;
    } catch (error) {
      console.error(`Error getting token balance for account ${tokenAccount.toBase58()}:`, error);
      throw new Error(`Failed to get token balance: ${error.message}`);
    }
  }

  /**
   * Get server wallet token balance
   * @param {PublicKey} tokenMintAddress - SPL token mint address
   * @returns {Promise<number>} Token balance in server wallet
   */
  async getServerTokenBalance(tokenMintAddress) {
    try {
      console.log(`Getting token balance for mint: ${tokenMintAddress.toBase58()}`);
      console.log(`Server wallet: ${this.serverWallet.publicKey.toBase58()}`);

      const programId = await this.getMintProgramId(tokenMintAddress);

      // Use getOrCreateAssociatedTokenAccount which will find the correct account
      const serverTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.serverWallet, // Payer
        tokenMintAddress,  // Mint
        this.serverWallet.publicKey, // Owner
        true, // Allow owner off curve
        'confirmed',
        undefined,
        programId
      );

      console.log(`Server token account: ${serverTokenAccount.address.toBase58()}`);

      const balance = await this.getTokenBalance(serverTokenAccount.address);
      console.log(`Balance retrieved: ${balance}`);

      return balance;
    } catch (error) {
      console.error('Detailed error in getServerTokenBalance:', error);
      if (error.message && error.message.includes('TokenAccountNotFoundError')) {
        console.log('Token account does not exist, returning 0 balance');
        return 0; // Return 0 if the token account doesn't exist
      }
      const errorMessage = error.message || JSON.stringify(error);
      throw new Error(`Failed to get server token balance: ${errorMessage}`);
    }
  }

  /**
   * Get server wallet SOL balance
   * @returns {Promise<number>} SOL balance in server wallet
   */
  async getSolBalance() {
    try {
      const balance = await this.connection.getBalance(this.serverWallet.publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error getting SOL balance:', error);
      throw new Error(`Failed to get SOL balance: ${error.message}`);
    }
  }

  /**
   * Transfer SOL to a recipient
   * @param {string} recipientAddress - Recipient's Solana wallet address
   * @param {number} amount - Amount of SOL to transfer
   * @returns {Promise<string>} Transaction signature
   */
  async transferSol(recipientAddress, amount) {
    try {
      // Validate inputs
      if (!this.isValidSolanaAddress(recipientAddress)) {
        throw new Error('Invalid recipient address');
      }

      const recipientPublicKey = new PublicKey(recipientAddress);
      const lamports = Math.round(amount * LAMPORTS_PER_SOL);

      // Check balance
      const balance = await this.connection.getBalance(this.serverWallet.publicKey);

      // We need to keep some dust for fees, but let's just check raw amount for now
      // A typical transfer is 5000 lamports (0.000005 SOL)
      if (balance < lamports + 5000) {
        throw new Error(`Insufficient SOL balance. Available: ${balance / LAMPORTS_PER_SOL}, Required: ${amount} + fees`);
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.serverWallet.publicKey,
          toPubkey: recipientPublicKey,
          lamports: lamports,
        })
      );

      const signature = await this.connection.sendTransaction(transaction, [this.serverWallet]);

      // Confirm transaction
      const latestBlockHash = await this.connection.getLatestBlockhash();
      await this.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: signature,
      });

      return signature;
    } catch (error) {
      console.error('Error in transferSol:', error);
      throw new Error(`Failed to transfer SOL: ${error.message}`);
    }
  }

  /**
   * Transfer SPL Tokens to a recipient
   * @param {string} recipientAddress - Recipient's Solana wallet address
   * @param {number} amount - Amount of tokens to transfer (UI Amount)
   * @param {PublicKey} tokenMintAddress - The Mint address of the token
   * @returns {Promise<string>} Transaction signature
   */
  async transferSplToken(recipientAddress, amount, tokenMintAddress) {
    try {
      console.log(`Starting SPL Token Transfer: ${amount} to ${recipientAddress}`);

      // 1. Validate Recipient
      if (!this.isValidSolanaAddress(recipientAddress)) {
        throw new Error('Invalid recipient address');
      }
      const recipientPublicKey = new PublicKey(recipientAddress);

      // 2. Get Mint Info (Decimals & Program Owner)
      const mintProgramId = await this.getMintProgramId(tokenMintAddress);
      const decimals = await this.getMintDecimals(tokenMintAddress);

      // Calculate raw amount (atoms/lamports equivalent for tokens)
      // Use BigInt for precision if necessary, but standard number usually suffices for max supply < 2^53
      // Math.pow(10, decimals) might lose precision for very high decimals combined with large amounts
      // Using BigInt logic for safety
      const factor = BigInt(10) ** BigInt(decimals);
      // Handle potential internal float representation of 'amount'
      // Best to stringify and split to avoid float errors, or standard Math.round if expected simple amounts
      // For now, simpler Math.round approach with standard JS numbers, assuming safe integer range
      // or convert amount to string and parse.
      const rawAmount = BigInt(Math.round(amount * Math.pow(10, decimals)));

      console.log(`Token Mint: ${tokenMintAddress.toBase58()}`);
      console.log(`Decimals: ${decimals}, Raw Amount: ${rawAmount.toString()}`);

      // 3. Get/Create Recipient's Associated Token Account (ATA)
      // We must pay for the rent if it doesn't exist
      const recipientATA = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.serverWallet, // Payer
        tokenMintAddress,
        recipientPublicKey, // Owner
        true, // Allow owner off curve
        'confirmed',
        undefined,
        mintProgramId
      );

      // 4. Get Server's Associated Token Account
      const serverATA = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.serverWallet, // Payer
        tokenMintAddress,
        this.serverWallet.publicKey, // Onwer
        true,
        'confirmed',
        undefined,
        mintProgramId
      );

      // Check balance (optional but good for error msg)
      const accountInfo = await this.connection.getTokenAccountBalance(serverATA.address);
      if (BigInt(accountInfo.value.amount) < rawAmount) {
        throw new Error(`Insufficient token balance. Available: ${accountInfo.value.uiAmount}, Required: ${amount}`);
      }

      // 5. Create Transfer Instruction
      const transaction = new Transaction().add(
        createTransferInstruction(
          serverATA.address, // Source
          recipientATA.address, // Destination
          this.serverWallet.publicKey, // Owner
          rawAmount, // Amount in atoms
          [], // Multi-signers
          mintProgramId // Program ID (Token or Token-2022)
        )
      );

      // 6. Send and Confirm
      const signature = await this.connection.sendTransaction(transaction, [this.serverWallet]);

      const latestBlockHash = await this.connection.getLatestBlockhash();
      await this.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: signature,
      });

      console.log(`Transfer successful. Signature: ${signature}`);
      return signature;

    } catch (error) {
      console.error('Error in transferSplToken:', error);
      throw new Error(`Failed to transfer SPL Token: ${error.message}`);
    }
  }

  /**
   * Transfer SOL or an SPL Token to a recipient using Magicblock's Private Payments API
   * @param {string} recipientAddress - Recipient's Solana wallet address
   * @param {number} amount - Amount of SOL or tokens to transfer
   * @param {string} [tokenMintAddress] - Optional SPL token mint address
   * @returns {Promise<string>} Transaction signature
   */
  async transferMagicblock(recipientAddress, amount, tokenMintAddress) {
    try {
      // Validate inputs
      if (!this.isValidSolanaAddress(recipientAddress)) {
        throw new Error('Invalid recipient address');
      }

      let mintStr = "So11111111111111111111111111111111111111112"; // Default to WSOL
      let decimals = 9; // SOL has 9 decimals
      let isSol = true;

      if (tokenMintAddress && this.isValidSolanaAddress(tokenMintAddress)) {
        mintStr = tokenMintAddress;
        decimals = await this.getMintDecimals(new PublicKey(tokenMintAddress));
        isSol = false;
      }

      const rawAmount = Math.round(amount * Math.pow(10, decimals));

      if (isSol) {
        // Check SOL balance
        const balance = await this.connection.getBalance(this.serverWallet.publicKey);
        if (balance < rawAmount + 5000) {
          throw new Error(`Insufficient SOL balance. Available: ${balance / LAMPORTS_PER_SOL}, Required: ${amount} + fees`);
        }

        // Request Magicblock API
        const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
        const ata = await getAssociatedTokenAddress(WSOL_MINT, this.serverWallet.publicKey);
        
        const wsolInfo = await this.connection.getAccountInfo(ata);
        let wsolBalance = 0;
        if (wsolInfo) {
            const tokenAccountBalance = await this.connection.getTokenAccountBalance(ata);
            wsolBalance = parseInt(tokenAccountBalance.value.amount, 10);
        }

        // Check if we need to wrap more SOL
        const magicblockFee = 1000000;
        const margin = 10000000;
        const requiredWsol = rawAmount + magicblockFee + margin;
        
        if (wsolBalance < requiredWsol) {
            const wrapAmount = requiredWsol - wsolBalance;
            console.log(`Insufficient WSOL. Wrapping ${wrapAmount} lamports...`);
            const wrapTx = new Transaction();
            if (!wsolInfo) {
                wrapTx.add(createAssociatedTokenAccountInstruction(
                    this.serverWallet.publicKey,
                    ata,
                    this.serverWallet.publicKey,
                    WSOL_MINT
                ));
            }
            wrapTx.add(SystemProgram.transfer({
                fromPubkey: this.serverWallet.publicKey,
                toPubkey: ata,
                lamports: wrapAmount
            }));
            wrapTx.add(createSyncNativeInstruction(ata));

            const sig = await this.connection.sendTransaction(wrapTx, [this.serverWallet]);
            await this.connection.confirmTransaction(sig);
            console.log(`WSOL Wrapped successfully. Signature: ${sig}`);
        }
      } else {
        // For SPL tokens, ensure the server has enough balance
        const programId = await this.getMintProgramId(new PublicKey(tokenMintAddress));
        const serverATA = await getOrCreateAssociatedTokenAccount(
          this.connection,
          this.serverWallet, // Payer
          new PublicKey(tokenMintAddress),
          this.serverWallet.publicKey, // Owner
          true,
          'confirmed',
          undefined,
          programId
        );
        const accountInfo = await this.connection.getTokenAccountBalance(serverATA.address);
        if (BigInt(accountInfo.value.amount) < BigInt(rawAmount)) {
          throw new Error(`Insufficient token balance. Available: ${accountInfo.value.uiAmount}, Required: ${amount}`);
        }
      }

      const payload = {
        from: this.serverWallet.publicKey.toBase58(),
        to: recipientAddress,
        mint: mintStr,
        amount: rawAmount,
        visibility: "private",
        fromBalance: "base",
        toBalance: "base",
        cluster: this.network,
        wrapAndUnwrapSol: isSol
      };

      console.log(`Requesting Magicblock transfer for ${amount} of ${mintStr} to ${recipientAddress} via ${this.network}`);
      const response = await axios.post('https://payments.magicblock.app/v1/spl/transfer', payload);

      if (!response.data || !response.data.transactionBase64) {
        throw new Error('Invalid response from Magicblock API');
      }

      const transactionBuffer = Buffer.from(response.data.transactionBase64, 'base64');
      
      let signature;
      if (response.data.version === 'v0') {
        const versionedTransaction = VersionedTransaction.deserialize(transactionBuffer);
        versionedTransaction.sign([this.serverWallet]);
        signature = await this.connection.sendTransaction(versionedTransaction);
      } else {
        const transaction = Transaction.from(transactionBuffer);
        transaction.sign(this.serverWallet);
        signature = await this.connection.sendRawTransaction(transaction.serialize());
      }

      // Confirm transaction
      const latestBlockHash = await this.connection.getLatestBlockhash();
      await this.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: signature,
      });

      return signature;
    } catch (error) {
      if (error.logs) {
         console.error('Transaction logs:', error.logs);
      } else if (typeof error.getLogs === 'function') {
         console.error('Transaction logs:', error.getLogs());
      }
      console.error('Error in transferMagicblock:', error?.response?.data || error);
      throw new Error(`Failed to transfer via Magicblock: ${error?.response?.data?.error?.message || error.message}`);
    }
  }
}

module.exports = SolanaService;