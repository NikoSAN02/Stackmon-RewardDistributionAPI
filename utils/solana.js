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
const nacl = require('tweetnacl');

// Devnet USDC Mint Address
const USDC_DEVNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// Wrapped SOL Mint Address (same on devnet and mainnet)
const WSOL_DEVNET_MINT = 'So11111111111111111111111111111111111111112';

// Magicblock Private Payments API base URL
const MAGICBLOCK_API_URL = 'https://payments.magicblock.app';

// Minimum deposit amount in USDC base units (5 USDC = 5_000_000)
// This avoids repeated tiny deposits for every transfer
const MIN_DEPOSIT_AMOUNT = 5_000_000;

class SolanaService {
  constructor() {
    try {
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
      }
    } catch (error) {
      console.error('❌ Failed to initialize SolanaService:', error.message);
      this.initError = error;
    }
  }

  /**
   * Helper to ensure the service is successfully initialized before running any operation
   */
  checkInit() {
    if (this.initError) {
      throw new Error(`SolanaService is not initialized: ${this.initError.message}`);
    }

    // Cached Magicblock auth token
    this._magicblockAuthToken = null;
    this._magicblockAuthTokenExpiry = 0;
  }

  /**
   * Get the Magicblock-specific cluster string identifier
   * for routing to the private/TEE Ephemeral Rollup.
   * @returns {string} Cluster string
   */
  getMagicblockCluster() {
    if (this.network === 'devnet') {
      return 'devnet-private';
    }
    if (this.network === 'mainnet-beta' || this.network === 'mainnet') {
      return 'mainnet-private';
    }
    return this.network;
  }

  /**
   * Get the Magicblock-specific Ephemeral RPC URL
   * for querying balances/sending transactions to the private/TEE Ephemeral Rollup.
   * @returns {string} RPC URL
   */
  getMagicblockEphemeralRpc() {
    if (this.network === 'devnet') {
      return 'https://devnet-tee.magicblock.app';
    }
    if (this.network === 'mainnet-beta' || this.network === 'mainnet') {
      return 'https://mainnet-tee.magicblock.app';
    }
    return 'https://devnet-tee.magicblock.app';
  }

  /**
   * Get the server wallet keypair
   * @returns {Keypair} Server wallet keypair
   */
  getServerWallet() {
    this.checkInit();
    return this.serverWallet;
  }

  /**
   * Get connection instance
   * @returns {Connection} Solana connection
   */
  getConnection() {
    this.checkInit();
    return this.connection;
  }

  /**
   * Get the Program ID for a Mint address (Token or Token-2022)
   * @param {PublicKey} mintAddress - Mint address
   * @returns {Promise<PublicKey>} Program ID
   */
  async getMintProgramId(mintAddress) {
    this.checkInit();
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
    this.checkInit();
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
    this.checkInit();
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
    this.checkInit();
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
    this.checkInit();
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
    this.checkInit();
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
    this.checkInit();
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
    this.checkInit();
    try {
      // Dynamic fallback for SOL (Wrapped SOL mint) to transfer native SOL directly
      if (tokenMintAddress && tokenMintAddress.toBase58() === 'So11111111111111111111111111111111111111112') {
        console.log(`Redirecting to native SOL transfer for recipient: ${recipientAddress}`);
        return await this.transferSol(recipientAddress, amount);
      }

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

  // ─── Magicblock Private Payments: Authentication ────────────────────────

  /**
   * Authenticate with Magicblock's Private Ephemeral Rollup.
   * Uses challenge-response signing to obtain a bearer token.
   * Caches the token for 25 minutes (tokens typically expire after 30 min).
   * @returns {Promise<string>} Bearer token
   */
  async getMagicblockAuthToken() {
    // Return cached token if still valid
    if (this._magicblockAuthToken && Date.now() < this._magicblockAuthTokenExpiry) {
      return this._magicblockAuthToken;
    }

    const pubkey = this.serverWallet.publicKey.toBase58();
    console.log(`🔑 Authenticating with Magicblock PER for wallet ${pubkey}...`);

    // Step 1: Request a challenge
    const challengeRes = await axios.get(`${MAGICBLOCK_API_URL}/v1/spl/challenge`, {
      params: { pubkey, cluster: this.getMagicblockCluster() }
    });

    const challenge = challengeRes.data.challenge;
    if (!challenge) {
      throw new Error('Magicblock API returned empty challenge');
    }

    // Step 2: Sign the challenge with the server wallet
    const messageBytes = Buffer.from(challenge);
    const signature = nacl.sign.detached(messageBytes, this.serverWallet.secretKey);
    const signatureBase58 = bs58.encode(signature);

    // Step 3: Login
    const loginRes = await axios.post(`${MAGICBLOCK_API_URL}/v1/spl/login`, {
      pubkey,
      challenge,
      signature: signatureBase58,
      cluster: this.getMagicblockCluster()
    });

    const token = loginRes.data.token;
    if (!token) {
      throw new Error('Magicblock API login did not return a token');
    }

    // Cache the token for 25 minutes
    this._magicblockAuthToken = token;
    this._magicblockAuthTokenExpiry = Date.now() + 25 * 60 * 1000;

    console.log(`✅ Magicblock PER authentication successful`);
    return token;
  }

  // ─── Magicblock Private Payments: Private Balance ──────────────────────

  /**
   * Get the server wallet's ephemeral (private) balance for a given mint.
   * @param {string} [mintAddress] - SPL mint address (defaults to devnet USDC)
   * @returns {Promise<number>} Balance in base units (e.g. 1_000_000 = 1 USDC)
   */
  async getMagicblockPrivateBalance(mintAddress) {
    const mint = mintAddress || USDC_DEVNET_MINT;
    const pubkey = this.serverWallet.publicKey.toBase58();

    const token = await this.getMagicblockAuthToken();

    const res = await axios.get(`${MAGICBLOCK_API_URL}/v1/spl/private-balance`, {
      params: { address: pubkey, mint, cluster: this.getMagicblockCluster() },
      headers: { Authorization: `Bearer ${token}` }
    });

    const balance = parseInt(res.data.balance, 10) || 0;
    console.log(`💰 Magicblock ephemeral balance: ${balance} base units (mint: ${mint})`);
    return balance;
  }

  // ─── Magicblock Private Payments: Deposit into PER ─────────────────────

  /**
   * Deposit SPL tokens from the server's base (on-chain) balance into the
   * Private Ephemeral Rollup. This "shields" the tokens.
   * @param {number} amount - Amount in base units to deposit
   * @param {string} [mintAddress] - SPL mint address (defaults to devnet USDC)
   * @returns {Promise<string>} Transaction signature of the deposit
   */
  async depositToMagicblockPER(amount, mintAddress) {
    const mint = mintAddress || USDC_DEVNET_MINT;
    console.log(`📥 Depositing ${amount} base units of ${mint} into Magicblock PER...`);

    // Request an unsigned deposit transaction from Magicblock
    const depositPayload = {
      owner: this.serverWallet.publicKey.toBase58(),
      mint,
      amount,
      cluster: this.getMagicblockCluster(),
      initIfMissing: true,
      initVaultIfMissing: true,
      initAtasIfMissing: true,
      idempotent: true
    };

    // Capture balances before deposit
    let baseBalanceBefore, perBalanceBefore, balanceMintPubkey, balanceProgramId, balanceServerATA;
    try {
      balanceMintPubkey = new PublicKey(mint);
      balanceProgramId = await this.getMintProgramId(balanceMintPubkey);
      balanceServerATA = await getOrCreateAssociatedTokenAccount(
        this.connection, this.serverWallet, balanceMintPubkey, this.serverWallet.publicKey,
        true, 'confirmed', undefined, balanceProgramId
      );
      const baseInfo = await this.connection.getTokenAccountBalance(balanceServerATA.address);
      baseBalanceBefore = BigInt(baseInfo.value.amount);
    } catch (e) {
      baseBalanceBefore = null;
    }
    try {
      const perBal = await this.getMagicblockPrivateBalance(mint);
      perBalanceBefore = BigInt(perBal);
    } catch (e) {
      perBalanceBefore = null;
    }

    const response = await axios.post(`${MAGICBLOCK_API_URL}/v1/spl/deposit`, depositPayload);
    console.log("MagicBlock Deposit Response:", response.data);

    if (!response.data || !response.data.transactionBase64) {
      throw new Error('Invalid response from Magicblock deposit API');
    }

    // Sign and send the deposit transaction
    const transactionBuffer = Buffer.from(response.data.transactionBase64, 'base64');
    let signature;

    let connectionToSend;
    if (response.data.sendRpcEndpoint) {
      connectionToSend = new Connection(response.data.sendRpcEndpoint, 'confirmed');
    } else if (response.data.sendTo) {
      if (response.data.sendTo === 'ephemeral') {
        throw new Error('MagicBlock requested ephemeral submission but did not provide an ephemeral RPC endpoint.');
      }
      connectionToSend = this.connection;
    } else {
      connectionToSend = this.connection;
    }

    if (response.data.version === 'v0') {
      const versionedTransaction = VersionedTransaction.deserialize(transactionBuffer);
      versionedTransaction.sign([this.serverWallet]);
      signature = await connectionToSend.sendTransaction(versionedTransaction, { skipPreflight: true });
    } else {
      const transaction = Transaction.from(transactionBuffer);
      transaction.sign(this.serverWallet);
      signature = await connectionToSend.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
    }

    // Confirm the deposit
    const latestBlockHash = await connectionToSend.getLatestBlockhash();
    await connectionToSend.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature,
    });

    // Capture balances after deposit and verify
    let baseBalanceAfter, perBalanceAfter;
    try {
      const baseInfoAfter = await this.connection.getTokenAccountBalance(balanceServerATA.address);
      baseBalanceAfter = BigInt(baseInfoAfter.value.amount);
    } catch (e) {
      baseBalanceAfter = null;
    }
    try {
      const perBalAfter = await this.getMagicblockPrivateBalance(mint);
      perBalanceAfter = BigInt(perBalAfter);
    } catch (e) {
      perBalanceAfter = null;
    }

    console.log('----------------------------------------');
    console.log('Deposit Verification');
    console.log('----------------------------------------');
    console.log(`Wallet Before : ${baseBalanceBefore !== null ? baseBalanceBefore.toString() : 'N/A'}`);
    console.log(`Wallet After  : ${baseBalanceAfter !== null ? baseBalanceAfter.toString() : 'N/A'}`);
    console.log('');
    console.log(`PER Before    : ${perBalanceBefore !== null ? perBalanceBefore.toString() : 'N/A'}`);
    console.log(`PER After     : ${perBalanceAfter !== null ? perBalanceAfter.toString() : 'N/A'}`);
    console.log('');
    console.log(`Expected`);
    console.log(`Wallet -${amount}`);
    console.log(`PER +${amount}`);
    console.log('');
    if (baseBalanceBefore !== null && baseBalanceAfter !== null && perBalanceBefore !== null && perBalanceAfter !== null) {
      const walletDiff = baseBalanceBefore - baseBalanceAfter;
      const perDiff = perBalanceAfter - perBalanceBefore;
      if (walletDiff >= BigInt(amount) && perDiff >= BigInt(amount)) {
        console.log('PASS');
      } else {
        console.log('FAIL');
      }
    } else {
      console.log('Verification incomplete (some balances unavailable)');
    }
    console.log('----------------------------------------');

    console.log(`✅ Deposit confirmed. Signature: ${signature}`);
    return signature;
  }

  // ─── Magicblock Private Payments: Withdraw from PER ────────────────────

  /**
   * Withdraw SPL tokens from the Private Ephemeral Rollup back to the
   * server's base (on-chain) balance. This "un-shields" the tokens.
   * @param {number} amount - Amount in base units to withdraw
   * @param {string} [mintAddress] - SPL mint address (defaults to devnet USDC)
   * @returns {Promise<string>} Transaction signature of the withdrawal
   */
  async withdrawFromMagicblockPER(amount, mintAddress) {
    const mint = mintAddress || USDC_DEVNET_MINT;
    console.log(`📤 Withdrawing ${amount} base units of ${mint} from Magicblock PER...`);

    // Capture balances before withdraw
    let baseBalanceBefore, perBalanceBefore, balanceMintPubkey, balanceProgramId, balanceServerATA;
    try {
      balanceMintPubkey = new PublicKey(mint);
      balanceProgramId = await this.getMintProgramId(balanceMintPubkey);
      balanceServerATA = await getOrCreateAssociatedTokenAccount(
        this.connection, this.serverWallet, balanceMintPubkey, this.serverWallet.publicKey,
        true, 'confirmed', undefined, balanceProgramId
      );
      const baseInfo = await this.connection.getTokenAccountBalance(balanceServerATA.address);
      baseBalanceBefore = BigInt(baseInfo.value.amount);
    } catch (e) {
      baseBalanceBefore = null;
    }
    try {
      const perBal = await this.getMagicblockPrivateBalance(mint);
      perBalanceBefore = BigInt(perBal);
    } catch (e) {
      perBalanceBefore = null;
    }

    // Check PER balance before proceeding
    if (perBalanceBefore !== null && perBalanceBefore < BigInt(amount)) {
      throw new Error(
        `Insufficient PER balance for withdrawal. ` +
        `PER balance: ${perBalanceBefore.toString()} base units, ` +
        `needed: ${amount} base units.`
      );
    }

    // Request an unsigned withdraw transaction from Magicblock
    const withdrawPayload = {
      owner: this.serverWallet.publicKey.toBase58(),
      mint,
      amount,
      cluster: this.getMagicblockCluster(),
      initIfMissing: true,
      initAtasIfMissing: true,
      idempotent: true
    };

    const response = await axios.post(`${MAGICBLOCK_API_URL}/v1/spl/withdraw`, withdrawPayload);
    console.log("MagicBlock Withdraw Response:", response.data);

    if (!response.data || !response.data.transactionBase64) {
      throw new Error('Invalid response from Magicblock withdraw API');
    }

    // Sign and send the withdraw transaction
    const transactionBuffer = Buffer.from(response.data.transactionBase64, 'base64');
    let signature;

    let connectionToSend;
    if (response.data.sendRpcEndpoint) {
      connectionToSend = new Connection(response.data.sendRpcEndpoint, 'confirmed');
    } else if (response.data.sendTo) {
      if (response.data.sendTo === 'ephemeral') {
        throw new Error('MagicBlock requested ephemeral submission but did not provide an ephemeral RPC endpoint.');
      }
      connectionToSend = this.connection;
    } else {
      connectionToSend = this.connection;
    }

    if (response.data.version === 'v0') {
      const versionedTransaction = VersionedTransaction.deserialize(transactionBuffer);
      versionedTransaction.sign([this.serverWallet]);
      signature = await connectionToSend.sendTransaction(versionedTransaction, { skipPreflight: true });
    } else {
      const transaction = Transaction.from(transactionBuffer);
      transaction.sign(this.serverWallet);
      signature = await connectionToSend.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
    }

    // Confirm the withdraw
    const latestBlockHash = await connectionToSend.getLatestBlockhash();
    await connectionToSend.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature,
    });

    // Debug: inspect the confirmed transaction on-chain
    try {
      const txInfo = await connectionToSend.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      if (txInfo) {
        console.log('');
        console.log('--- On-chain Transaction Debug ---');
        console.log('Slot:', txInfo.slot);
        if (txInfo.meta) {
          console.log('Meta.err:', txInfo.meta.err);
          console.log('preTokenBalances:', JSON.stringify(txInfo.meta.preTokenBalances, null, 2));
          console.log('postTokenBalances:', JSON.stringify(txInfo.meta.postTokenBalances, null, 2));
          console.log('logMessages:', txInfo.meta.logMessages);
        }
        console.log('--- End Debug ---');
        console.log('');
      } else {
        console.log('⚠️ Transaction not found on chain yet (may still be propagating)');
      }
    } catch (debugErr) {
      console.log('⚠️ Could not fetch transaction details:', debugErr.message);
    }

    // Print destination ATA and its on-chain balance
    try {
      const destAta = balanceServerATA.address;
      console.log(`Destination ATA: ${destAta.toBase58()}`);
      const destAtaInfo = await this.connection.getTokenAccountBalance(destAta);
      console.log(`Destination ATA balance: ${destAtaInfo.value.amount} base units (${destAtaInfo.value.uiAmountString} USDC)`);
    } catch (e) {
      console.log('⚠️ Could not fetch destination ATA balance:', e.message);
    }

    // Capture balances after withdraw and verify
    let baseBalanceAfter, perBalanceAfter;
    try {
      const baseInfoAfter = await this.connection.getTokenAccountBalance(balanceServerATA.address);
      baseBalanceAfter = BigInt(baseInfoAfter.value.amount);
    } catch (e) {
      baseBalanceAfter = null;
    }
    try {
      const perBalAfter = await this.getMagicblockPrivateBalance(mint);
      perBalanceAfter = BigInt(perBalAfter);
    } catch (e) {
      perBalanceAfter = null;
    }

    console.log('----------------------------------------');
    console.log('Withdraw Verification');
    console.log('----------------------------------------');
    console.log(`Wallet Before : ${baseBalanceBefore !== null ? baseBalanceBefore.toString() : 'N/A'}`);
    console.log(`Wallet After  : ${baseBalanceAfter !== null ? baseBalanceAfter.toString() : 'N/A'}`);
    console.log('');
    console.log(`PER Before    : ${perBalanceBefore !== null ? perBalanceBefore.toString() : 'N/A'}`);
    console.log(`PER After     : ${perBalanceAfter !== null ? perBalanceAfter.toString() : 'N/A'}`);
    console.log('');
    console.log(`Withdraw Amount : ${amount}`);
    console.log('');
    console.log(`Expected`);
    console.log(`Wallet +${amount}`);
    console.log(`PER -${amount}`);
    console.log('');
    if (baseBalanceBefore !== null && baseBalanceAfter !== null && perBalanceBefore !== null && perBalanceAfter !== null) {
      const walletDiff = baseBalanceAfter - baseBalanceBefore;
      const perDiff = perBalanceBefore - perBalanceAfter;
      if (walletDiff >= BigInt(amount) && perDiff >= BigInt(amount)) {
        console.log('PASS');
      } else {
        console.log('FAIL');
      }
    } else {
      console.log('Verification incomplete (some balances unavailable)');
    }
    console.log('----------------------------------------');

    console.log(`✅ Withdraw confirmed. Signature: ${signature}`);
    return signature;
  }

  // ─── Magicblock Private Payments: SOL wrapping ─────────────────────────

  /**
   * Wrap native SOL into Wrapped SOL (wSOL) for the server wallet
   * @param {number} amountRaw - Amount in lamports (base units) to wrap
   */
  async wrapSol(amountRaw) {
    this.checkInit();
    try {
      const wsolMint = new PublicKey('So11111111111111111111111111111111111111112');
      const serverWsolAta = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.serverWallet,
        wsolMint,
        this.serverWallet.publicKey,
        true,
        'confirmed'
      );

      // Create transaction to send SOL to the wSOL ATA and sync it
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.serverWallet.publicKey,
          toPubkey: serverWsolAta.address,
          lamports: amountRaw
        }),
        createSyncNativeInstruction(serverWsolAta.address)
      );

      const signature = await this.connection.sendTransaction(transaction, [this.serverWallet]);
      const latestBlock = await this.connection.getLatestBlockhash();
      await this.connection.confirmTransaction({
        blockhash: latestBlock.blockhash,
        lastValidBlockHeight: latestBlock.lastValidBlockHeight,
        signature
      });

      console.log(`✅ Successfully wrapped ${amountRaw / 1e9} SOL to wSOL. Signature: ${signature}`);
      return signature;
    } catch (error) {
      console.error('Error wrapping SOL:', error);
      throw new Error(`Failed to wrap SOL: ${error.message}`);
    }
  }

  // ─── Magicblock Private Payments: Ephemeral Transfer ───────────────────

  /**
   * Initializes and delegates the transfer queue for a mint if it is not already initialized.
   * This is a one-time setup per mint+validator pair.
   * @param {string} mintAddress 
   */
  async initializeMintIfNeeded(mintAddress) {
    this.checkInit();
    const mintStr = mintAddress || USDC_DEVNET_MINT;
    try {
      console.log(`Checking if mint ${mintStr} is initialized on Magicblock...`);
      const checkRes = await axios.get(`${MAGICBLOCK_API_URL}/v1/spl/is-mint-initialized`, {
        params: { mint: mintStr, cluster: this.getMagicblockCluster() }
      });

      if (checkRes.data && checkRes.data.initialized) {
        console.log(`✅ Mint ${mintStr} is already initialized on Magicblock`);
        return;
      }

      console.log(`⚠️ Mint ${mintStr} is not initialized on Magicblock. Running initialization...`);
      const initPayload = {
        payer: this.serverWallet.publicKey.toBase58(),
        mint: mintStr,
        cluster: this.getMagicblockCluster()
      };

      const response = await axios.post(`${MAGICBLOCK_API_URL}/v1/spl/initialize-mint`, initPayload);
      if (!response.data || !response.data.transactionBase64) {
        throw new Error('Invalid response from Magicblock initialize-mint API');
      }

      const transactionBuffer = Buffer.from(response.data.transactionBase64, 'base64');
      
      let signature;
      if (response.data.version === 'v0') {
        const versionedTransaction = VersionedTransaction.deserialize(transactionBuffer);
        versionedTransaction.sign([this.serverWallet]);
        signature = await this.connection.sendTransaction(versionedTransaction, { skipPreflight: true });
      } else {
        const transaction = Transaction.from(transactionBuffer);
        transaction.sign(this.serverWallet);
        signature = await this.connection.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
      }

      const latestBlockHash = await this.connection.getLatestBlockhash();
      await this.connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature,
      });

      console.log(`✅ Mint ${mintStr} successfully initialized on Magicblock. Signature: ${signature}`);
    } catch (error) {
      const apiErrorMsg = error?.response?.data?.error?.message || error?.response?.data?.message;
      console.error(`❌ Failed to initialize mint ${mintStr} on Magicblock:`, apiErrorMsg || error.message);
    }
  }

  /**
   * Transfer USDC to a recipient using Magicblock's Private Payments API.
   * Uses ephemeral-to-ephemeral transfer for full privacy.
   *
   * Before transferring, this method:
   * 1. Checks the server's ephemeral balance.
   * 2. If insufficient, deposits more USDC from the base chain into the PER.
   * 3. Executes the private ephemeral-to-ephemeral transfer.
   *
   * @param {string} recipientAddress - Recipient's Solana wallet address
   * @param {number} amount - Amount of USDC to transfer (UI amount, e.g. 1.5 = 1.5 USDC)
   * @param {string} [tokenMintAddress] - Optional SPL token mint address (defaults to devnet USDC)
   * @returns {Promise<string>} Transaction signature
   */
  async transferMagicblock(recipientAddress, amount, tokenMintAddress) {
    this.checkInit();
    try {
      // Validate inputs
      if (!this.isValidSolanaAddress(recipientAddress)) {
        throw new Error('Invalid recipient address');
      }

      // Default to devnet USDC
      const mintStr = (tokenMintAddress && this.isValidSolanaAddress(tokenMintAddress))
        ? tokenMintAddress
        : USDC_DEVNET_MINT;

      const isWsol = mintStr === 'So11111111111111111111111111111111111111112';

      // Ensure the mint is initialized before transfer
      await this.initializeMintIfNeeded(mintStr);

      // Get decimals for the mint (USDC = 6, wSOL = 9)
      const decimals = await this.getMintDecimals(new PublicKey(mintStr));
      const rawAmount = Math.round(amount * Math.pow(10, decimals));

      if (rawAmount <= 0) {
        throw new Error(`Transfer amount must be positive. Got: ${amount} (${rawAmount} base units)`);
      }

      console.log(`🔄 Preparing Magicblock private transfer: ${amount} (${rawAmount} base units) of mint ${mintStr} to ${recipientAddress}`);

      // ── Step 1: Check & top-up server's ephemeral balance ──────────
      // For wSOL, query the ephemeral RPC directly (indexer doesn't parse wSOL shuttle accounts correctly)
      // For USDC, use the private balance API
      let ephemeralBalance;
      if (isWsol) {
        const authToken = await this.getMagicblockAuthToken();
        const ephemeralRpc = new Connection(`${this.getMagicblockEphemeralRpc()}?token=${authToken}`, 'confirmed');
        const serverEata = await getAssociatedTokenAddress(new PublicKey(WSOL_DEVNET_MINT), this.serverWallet.publicKey);
        try {
          const balRes = await ephemeralRpc.getTokenAccountBalance(serverEata);
          ephemeralBalance = parseInt(balRes.value.amount, 10);
          console.log(`Server ephemeral wSOL balance: ${ephemeralBalance / 1e9} wSOL`);
        } catch (e) {
          ephemeralBalance = 0;
          console.log(`Server ephemeral wSOL balance: 0 (EATA not found)`);
        }
      } else {
        try {
          ephemeralBalance = await this.getMagicblockPrivateBalance(mintStr);
        } catch (balanceErr) {
          console.warn(`⚠️ Could not fetch ephemeral balance (${balanceErr.message}). Will attempt transfer anyway.`);
          ephemeralBalance = null;
        }
      }

      if (ephemeralBalance !== null && ephemeralBalance < rawAmount) {
        const shortfall = rawAmount - ephemeralBalance;
        const depositAmount = Math.max(shortfall, MIN_DEPOSIT_AMOUNT);

        console.log(`📉 Ephemeral balance (${ephemeralBalance}) < required (${rawAmount}). Depositing ${depositAmount} base units...`);

        // For wSOL: auto-wrap SOL if needed. For USDC: verify base balance.
        const mintPubkey = new PublicKey(mintStr);
        const programId = await this.getMintProgramId(mintPubkey);
        const serverATA = await getOrCreateAssociatedTokenAccount(
          this.connection, this.serverWallet, mintPubkey,
          this.serverWallet.publicKey, true, 'confirmed', undefined, programId
        );

        let baseAmount = BigInt(0);
        try {
          const baseBalance = await this.connection.getTokenAccountBalance(serverATA.address);
          baseAmount = BigInt(baseBalance.value.amount);
        } catch (ataErr) {
          baseAmount = BigInt(0);
        }

        if (isWsol && baseAmount < BigInt(depositAmount)) {
          const wsolShortfall = BigInt(depositAmount) - baseAmount;
          console.log(`Wrapping ${Number(wsolShortfall) / 1e9} SOL to wSOL for deposit...`);
          await this.wrapSol(Number(wsolShortfall));
          const refreshed = await this.connection.getTokenAccountBalance(serverATA.address);
          baseAmount = BigInt(refreshed.value.amount);
        }

        if (baseAmount < BigInt(depositAmount)) {
          const tokenName = isWsol ? 'wSOL' : 'USDC';
          throw new Error(
            `Insufficient ${tokenName} balance for deposit. ` +
            `Base chain balance: ${Number(baseAmount) / Math.pow(10, decimals)} ${tokenName}, ` +
            `needed to deposit: ${depositAmount / Math.pow(10, decimals)} ${tokenName}. ` +
            `Please fund the server wallet (${this.serverWallet.publicKey.toBase58()}) with more ${isWsol ? 'SOL' : 'USDC'}.`
          );
        }

        await this.depositToMagicblockPER(depositAmount, mintStr);

        if (isWsol) {
          // Poll ephemeral RPC until balance is confirmed
          const authToken = await this.getMagicblockAuthToken();
          const ephemeralRpc = new Connection(`${this.getMagicblockEphemeralRpc()}?token=${authToken}`, 'confirmed');
          const serverEata = await getAssociatedTokenAddress(new PublicKey(WSOL_DEVNET_MINT), this.serverWallet.publicKey);
          console.log('Polling ephemeral balance for wSOL...');
          for (let i = 0; i < 15; i++) {
            try {
              const balRes = await ephemeralRpc.getTokenAccountBalance(serverEata);
              ephemeralBalance = parseInt(balRes.value.amount, 10);
              if (ephemeralBalance >= rawAmount) {
                console.log(`✅ Ephemeral wSOL confirmed: ${ephemeralBalance / 1e9} wSOL`);
                break;
              }
            } catch (e) {}
            await new Promise(r => setTimeout(r, 2000));
          }
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // ── Step 2: Execute the private SOL/USDC ephemeral→base transfer ─────
      // For SOL: wrapAndUnwrapSol=true tells Magicblock to settle native SOL (not wSOL) to recipient
      // For USDC: wrapAndUnwrapSol=false, standard SPL token settlement
      const authToken = await this.getMagicblockAuthToken();
      const payload = {
        from: this.serverWallet.publicKey.toBase58(),
        to: recipientAddress,
        mint: mintStr,
        amount: rawAmount,
        visibility: "private",
        fromBalance: "ephemeral",
        toBalance: "base",
        cluster: this.getMagicblockCluster(),
        wrapAndUnwrapSol: isWsol,
        initIfMissing: false,
        initAtasIfMissing: true,
        initVaultIfMissing: false
      };

      console.log(`📤 Requesting Magicblock private transfer (wrapAndUnwrapSol: ${isWsol})...`);
      const response = await axios.post(`${MAGICBLOCK_API_URL}/v1/spl/transfer`, payload, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log("MagicBlock Transfer Response:", response.data);


      if (!response.data || !response.data.transactionBase64) {
        throw new Error('Invalid response from Magicblock transfer API');
      }

      const transactionBuffer = Buffer.from(response.data.transactionBase64, 'base64');

      let connectionToSend;
      if (response.data.sendRpcEndpoint) {
        let endpoint = response.data.sendRpcEndpoint;
        if ((endpoint.includes('tee.magicblock.app') || endpoint.includes('devnet.magicblock.app')) && !endpoint.includes('token=')) {
          endpoint = `${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${authToken}`;
        }
        connectionToSend = new Connection(endpoint, 'confirmed');
      } else if (response.data.sendTo) {
        if (response.data.sendTo === 'ephemeral') {
          throw new Error('MagicBlock requested ephemeral submission but did not provide an ephemeral RPC endpoint.');
        }
        connectionToSend = this.connection;
      } else {
        connectionToSend = this.connection;
      }

      let signature;
      if (response.data.version === 'v0') {
        const versionedTransaction = VersionedTransaction.deserialize(transactionBuffer);
        versionedTransaction.sign([this.serverWallet]);
        signature = await connectionToSend.sendTransaction(versionedTransaction, { skipPreflight: true });
      } else {
        const transaction = Transaction.from(transactionBuffer);
        transaction.sign(this.serverWallet);
        signature = await connectionToSend.sendRawTransaction(transaction.serialize(), { skipPreflight: true });
      }

      // Confirm the transfer transaction
      const latestBlockHash = await connectionToSend.getLatestBlockhash();
      await connectionToSend.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature,
      });

      // Verify sender balance after transfer
      console.log('----------------------------------------');
      console.log('Transfer Verification');
      console.log('----------------------------------------');
      console.log(`Sender PER Before : ${ephemeralBalance !== null ? ephemeralBalance : 'N/A'}`);
      let senderPerAfter;
      try {
        senderPerAfter = await this.getMagicblockPrivateBalance(mintStr);
        console.log(`Sender PER After  : ${senderPerAfter !== null ? senderPerAfter : 'N/A'}`);
      } catch (e) {
        senderPerAfter = null;
        console.log(`Sender PER After  : N/A`);
      }
      console.log('');
      console.log(`Transfer Amount: ${rawAmount}`);
      console.log('');
      if (ephemeralBalance !== null && senderPerAfter !== null) {
        const senderDiff = ephemeralBalance - senderPerAfter;
        console.log(`Sender Diff: -${senderDiff}`);
        if (senderDiff >= rawAmount) {
          console.log('PASS');
        } else {
          console.log('FAIL');
        }
      } else {
        console.log('Verification incomplete (sender balances unavailable)');
      }
      console.log('TODO: Recipient PER verification skipped (only sender wallet loaded)');
      console.log('----------------------------------------');

      console.log(`✅ Magicblock private transfer confirmed. Signature: ${signature}`);
      return signature;
    } catch (error) {
      if (error.logs) {
         console.error('Transaction logs:', error.logs);
      } else if (typeof error.getLogs === 'function') {
         console.error('Transaction logs:', error.getLogs());
      }

      const apiErrorMsg = error?.response?.data?.error?.message || error?.response?.data?.message;
      const errorDetail = apiErrorMsg || error.message;

      // Provide actionable error if the recipient hasn't deposited into PER
      if (errorDetail && (errorDetail.includes('account not found') || errorDetail.includes('not initialized') || errorDetail.includes('not delegated'))) {
        console.error(`❌ Recipient ${recipientAddress} has not deposited into the Magicblock PER.`);
        throw new Error(
          `Recipient wallet ${recipientAddress} has not deposited into the Private Ephemeral Rollup (PER). ` +
          `The recipient must first deposit USDC into the PER before they can receive private transfers. ` +
          `Original error: ${errorDetail}`
        );
      }

      console.error('Error in transferMagicblock:', error?.response?.data || error);
      throw new Error(`Failed to transfer via Magicblock: ${errorDetail}`);
    }
  }

  /**
   * Set up a private transfer that will be partially signed by the server
   * and returned to the client for the final signature (user's wallet).
   * 
   * @param {string} recipientAddress - Recipient's Solana wallet address
   * @param {number} amount - Amount of USDC to transfer (UI amount)
   * @param {string} [tokenMintAddress] - Optional SPL token mint address
   * @returns {Promise<Object>} Partially signed transaction and metadata
   */
  async setupPrivateTransfer(recipientAddress, amount, tokenMintAddress) {
    this.checkInit();
    try {
      if (!this.isValidSolanaAddress(recipientAddress)) {
        throw new Error('Invalid recipient address');
      }

      const mintStr = tokenMintAddress || USDC_DEVNET_MINT;
      const isWsol = mintStr === 'So11111111111111111111111111111111111111112';

      // Ensure the mint is initialized before transfer
      await this.initializeMintIfNeeded(mintStr);

      const decimals = await this.getMintDecimals(new PublicKey(mintStr));
      const rawAmount = Math.round(amount * Math.pow(10, decimals));

      if (rawAmount <= 0) {
        throw new Error(`Transfer amount must be positive. Got: ${amount}`);
      }

      // Check & top-up server's balance based on token type
      if (isWsol) {
        // For wSOL (SOL), ensure server has enough base (on-chain) wSOL
        const mintPubkey = new PublicKey(mintStr);
        const programId = await this.getMintProgramId(mintPubkey);
        const serverATA = await getOrCreateAssociatedTokenAccount(
          this.connection,
          this.serverWallet,
          mintPubkey,
          this.serverWallet.publicKey,
          true,
          'confirmed',
          undefined,
          programId
        );

        let baseAmount = BigInt(0);
        try {
          const baseBalance = await this.connection.getTokenAccountBalance(serverATA.address);
          baseAmount = BigInt(baseBalance.value.amount);
        } catch (ataErr) {
          baseAmount = BigInt(0);
        }

        if (baseAmount < BigInt(rawAmount)) {
          const wsolShortfall = BigInt(rawAmount) - baseAmount;
          console.log(`Wrapping ${Number(wsolShortfall) / 1e9} SOL to wSOL for server wallet to cover transfer...`);
          await this.wrapSol(Number(wsolShortfall));
        }
      } else {
        // For USDC, check & top-up server's ephemeral balance
        let ephemeralBalance;
        try {
          ephemeralBalance = await this.getMagicblockPrivateBalance(mintStr);
        } catch (balanceErr) {
          ephemeralBalance = null;
        }

        if (ephemeralBalance !== null && ephemeralBalance < rawAmount) {
          const shortfall = rawAmount - ephemeralBalance;
          const depositAmount = Math.max(shortfall, MIN_DEPOSIT_AMOUNT);

          console.log(`📉 Ephemeral balance (${ephemeralBalance}) < required (${rawAmount}). Depositing ${depositAmount} base units...`);

          const mintPubkey = new PublicKey(mintStr);
          const programId = await this.getMintProgramId(mintPubkey);
          const serverATA = await getOrCreateAssociatedTokenAccount(
            this.connection,
            this.serverWallet,
            mintPubkey,
            this.serverWallet.publicKey,
            true,
            'confirmed',
            undefined,
            programId
          );

          let baseAmount = BigInt(0);
          try {
            const baseBalance = await this.connection.getTokenAccountBalance(serverATA.address);
            baseAmount = BigInt(baseBalance.value.amount);
          } catch (ataErr) {
            baseAmount = BigInt(0);
          }

          if (baseAmount < BigInt(depositAmount)) {
            throw new Error(
              `Insufficient USDC balance for deposit. ` +
              `Base chain balance: ${Number(baseAmount) / 1e6} USDC, ` +
              `needed to deposit: ${depositAmount / 1e6} USDC. ` +
              `Please fund the server wallet (${this.serverWallet.publicKey.toBase58()}) with more USDC.`
            );
          }

          await this.depositToMagicblockPER(depositAmount, mintStr);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Request the transfer transaction from Magicblock
      const payload = {
        from: this.serverWallet.publicKey.toBase58(),
        to: recipientAddress,
        mint: mintStr,
        amount: rawAmount,
        visibility: isWsol ? "public" : "private", // Public transfer for SOL to allow custom unwrap instruction
        fromBalance: isWsol ? "base" : "ephemeral",
        toBalance: "base", // Settle directly to user's base wallet
        cluster: this.network,
        wrapAndUnwrapSol: false, // We will manually unwrap SOL
        initIfMissing: false,
        initAtasIfMissing: true,
        initVaultIfMissing: false
      };

      console.log(`📤 Requesting Magicblock transfer setup (wSOL=${isWsol})...`);
      const response = await axios.post(`${MAGICBLOCK_API_URL}/v1/spl/transfer`, payload);

      if (!response.data || !response.data.transactionBase64) {
        throw new Error('Invalid response from Magicblock transfer API');
      }

      const transactionBuffer = Buffer.from(response.data.transactionBase64, 'base64');
      let signedTxBase64;

      if (isWsol) {
        // For wSOL (SOL), deserialize and append the CloseAccount instruction so it unwraps to SOL instantly
        const transaction = Transaction.from(transactionBuffer);
        const recipientPubkey = new PublicKey(recipientAddress);
        const recipientWsolAta = await getAssociatedTokenAddress(new PublicKey(WSOL_DEVNET_MINT), recipientPubkey);
        
        transaction.add(
          createCloseAccountInstruction(
            recipientWsolAta,
            recipientPubkey, // Destination for the unwrapped SOL
            recipientPubkey // Owner authority (recipient)
          )
        );

        transaction.partialSign(this.serverWallet);
        signedTxBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
      } else {
        // For USDC, partially sign as usual
        if (response.data.version === 'v0') {
          const versionedTransaction = VersionedTransaction.deserialize(transactionBuffer);
          versionedTransaction.sign([this.serverWallet]);
          signedTxBase64 = Buffer.from(versionedTransaction.serialize()).toString('base64');
        } else {
          const transaction = Transaction.from(transactionBuffer);
          transaction.partialSign(this.serverWallet);
          signedTxBase64 = transaction.serialize({ requireAllSignatures: false }).toString('base64');
        }
      }

      return {
        transaction: signedTxBase64,
        version: isWsol ? 'legacy' : response.data.version, // Use legacy for wSOL to support custom instructions
        sendRpcEndpoint: isWsol ? undefined : (response.data.sendRpcEndpoint || 'https://devnet.magicblock.app'),
        requiredSigners: isWsol ? [this.serverWallet.publicKey.toBase58(), recipientAddress] : response.data.requiredSigners,
        amount: amount,
        recipient: recipientAddress
      };
    } catch (error) {
      const apiErrorMsg = error?.response?.data?.error?.message || error?.response?.data?.message;
      const errorDetail = apiErrorMsg || error.message;
      console.error('Error in setupPrivateTransfer:', error?.response?.data || error);
      throw new Error(`Failed to set up Magicblock transfer: ${errorDetail}`);
    }
  }
}

module.exports = SolanaService;