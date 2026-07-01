/* ==========================================================================
   Stackmon PER Developer Console Javascript Logic
   ========================================================================== */

const WSOL_DEVNET_MINT = 'So11111111111111111111111111111111111111112';
const MAGICBLOCK_API_URL = 'https://payments.magicblock.app';
const SOLANA_DEVNET_RPC = 'https://api.devnet.solana.com';

// Initialize Solana Connection
const connection = new solanaWeb3.Connection(SOLANA_DEVNET_RPC, 'confirmed');

// State
let userWallet = null;
let userToken = null;
let userTokenExpiry = 0;
let serverWalletAddress = '';

// DOM Elements
const btnConnect = document.getElementById('btn-connect');
const srvPubkey = document.getElementById('srv-pubkey');
const srvSol = document.getElementById('srv-sol');
const srvUsdcBase = document.getElementById('srv-usdc-base');
const srvUsdcPer = document.getElementById('srv-usdc-per');
const btnRefreshServer = document.getElementById('btn-refresh-server');

const userPubkey = document.getElementById('user-pubkey');
const userSol = document.getElementById('user-sol');
const userUsdcBase = document.getElementById('user-usdc-base');
const userUsdcPer = document.getElementById('user-usdc-per');
const btnRefreshUser = document.getElementById('btn-refresh-user');

const btnPerLogin = document.getElementById('btn-per-login');
const authStatusBadge = document.getElementById('auth-status-badge');
const expiryContainer = document.getElementById('expiry-container');
const authTokenExpiry = document.getElementById('auth-token-expiry');

const tabBtnDirect = document.getElementById('tab-btn-direct');
const tabBtnDeposit = document.getElementById('tab-btn-deposit');
const tabBtnWithdraw = document.getElementById('tab-btn-withdraw');
const tabBtnSend = document.getElementById('tab-btn-send');
const panelDirect = document.getElementById('panel-direct');
const panelDeposit = document.getElementById('panel-deposit');
const panelWithdraw = document.getElementById('panel-withdraw');
const panelSend = document.getElementById('panel-send');

const inputDirectAmount = document.getElementById('input-direct-amount');
const btnDirect = document.getElementById('btn-direct');
const directServerDisplay = document.getElementById('direct-server-display');
const inputDepositAmount = document.getElementById('input-deposit-amount');
const btnDeposit = document.getElementById('btn-deposit');
const inputWithdrawAmount = document.getElementById('input-withdraw-amount');
const btnWithdraw = document.getElementById('btn-withdraw');
const inputSendAmount = document.getElementById('input-send-amount');
const btnSend = document.getElementById('btn-send');
const sendServerDisplay = document.getElementById('send-server-display');

const inputRewardRecipient = document.getElementById('input-reward-recipient');
const inputRewardScore = document.getElementById('input-reward-score');
const selectRewardMode = document.getElementById('select-reward-mode');
const inputRewardBonus = document.getElementById('input-reward-bonus');
const inputRewardBet = document.getElementById('input-reward-bet');
const inputValidationToken = document.getElementById('input-validation-token');
const rewardEstimation = document.getElementById('reward-estimation');
const estBase = document.getElementById('est-base');
const estBonus = document.getElementById('est-bonus');
const btnTriggerReward = document.getElementById('btn-trigger-reward');
const btnClearLogs = document.getElementById('btn-clear-logs');
const logOutput = document.getElementById('log-output');

// Real-time Console Log Helper
function log(msg, type = 'info', signature = '') {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  
  if (signature) {
    line.innerHTML = `[${timestamp}] ${msg} <span class="signature">(View TX: ${signature.substring(0, 8)}...)</span>`;
    line.style.cursor = 'pointer';
    line.onclick = () => window.open(`https://explorer.solana.com/tx/${signature}?cluster=devnet`, '_blank');
  } else {
    line.innerText = `[${timestamp}] ${msg}`;
  }
  
  logOutput.appendChild(line);
  logOutput.scrollTop = logOutput.scrollHeight;
  console.log(`[${type.toUpperCase()}] ${msg}`);
}

// Base58 Binary Encoder
function bufferToBase58(buffer) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits = [0];
  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let string = '';
  // Deal with leading zeros
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    string += ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    string += ALPHABET[digits[i]];
  }
  return string;
}

// Derive ATA address (Token Mint Program)
function getAssociatedTokenAddress(wallet, mint) {
  const tokenProgramId = new solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const associatedTokenProgramId = new solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  
  const [ata] = solanaWeb3.PublicKey.findProgramAddressSync(
    [
      wallet.toBuffer(),
      tokenProgramId.toBuffer(),
      mint.toBuffer()
    ],
    associatedTokenProgramId
  );
  return ata;
}

// Update Estimation Box
function updateEstimation() {
  const score = parseFloat(inputRewardScore.value) || 0;
  const mode = selectRewardMode.value;
  const bonus = parseFloat(inputRewardBonus.value) || 0;
  const bet = parseFloat(inputRewardBet.value) || 0;
  
  let baseReward = 0;
  if (mode === 'practice') {
    baseReward = score * 0.001;
  } else if (mode === 'bot') {
    baseReward = score * 0.0005;
  } else if (mode === 'ranked') {
    baseReward = bet * 1.8;
  }
  
  const total = baseReward + bonus;
  rewardEstimation.innerText = `${total.toFixed(4)} SOL`;
  estBase.innerText = baseReward.toFixed(4);
  estBonus.innerText = bonus.toFixed(4);
}

// Tabs Event Listeners
function setActiveTab(activeBtn, activePanel) {
  [tabBtnDirect, tabBtnDeposit, tabBtnWithdraw, tabBtnSend].forEach(b => b.classList.remove('active'));
  [panelDirect, panelDeposit, panelWithdraw, panelSend].forEach(p => p.classList.remove('active'));
  activeBtn.className = 'tab-btn active';
  activePanel.className = 'tab-panel active';
}

tabBtnDirect.addEventListener('click', () => setActiveTab(tabBtnDirect, panelDirect));
tabBtnDeposit.addEventListener('click', () => setActiveTab(tabBtnDeposit, panelDeposit));
tabBtnWithdraw.addEventListener('click', () => setActiveTab(tabBtnWithdraw, panelWithdraw));
tabBtnSend.addEventListener('click', () => setActiveTab(tabBtnSend, panelSend));

// Clear log panel
btnClearLogs.addEventListener('click', () => {
  logOutput.innerHTML = '';
  log('Logs cleared.', 'system');
});

// Connect Wallet Action
btnConnect.addEventListener('click', async () => {
  if (!window.solana || !window.solana.isPhantom) {
    log('Phantom wallet not detected! Please install it from phantom.app.', 'error');
    alert('Phantom wallet is required for signing transactions.');
    return;
  }
  
  try {
    log('Connecting to Phantom wallet...', 'info');
    const resp = await window.solana.connect();
    userWallet = resp.publicKey;
    
    // Update Header Button
    btnConnect.innerHTML = `<span class="btn-icon">🟢</span> ${userWallet.toBase58().substring(0, 6)}...${userWallet.toBase58().substring(38)}`;
    btnConnect.className = 'btn btn-secondary';
    
    // Update User Panel Details
    userPubkey.innerText = userWallet.toBase58();
    userPubkey.title = userWallet.toBase58();
    document.getElementById('user-status-dot').className = 'status-indicator online';
    
    // Set Recipient input default
    if (!inputRewardRecipient.value) {
      inputRewardRecipient.value = userWallet.toBase58();
    }
    
    // Enable Actions
    btnRefreshUser.disabled = false;
    btnPerLogin.disabled = false;
    btnDirect.disabled = false;
    btnDeposit.disabled = false;
    btnWithdraw.disabled = false;
    btnSend.disabled = false;
    
    log(`Connected user: ${userWallet.toBase58()}`, 'success');
    
    // Auto-refresh balances
    await refreshUserStats();
  } catch (err) {
    log(`Wallet connection failed: ${err.message}`, 'error');
  }
});

// Refresh Server Stats
async function refreshServerStats() {
  try {
    log('Fetching server balance diagnostics...', 'info');
    srvPubkey.innerText = 'Loading...';
    
    const valToken = inputValidationToken.value;
    const res = await fetch('/balance', {
      headers: {
        'X-Unity-Validation': valToken
      }
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.message || `HTTP ${res.status}`);
    }
    
    const body = await res.json();
    const data = body.data;
    
    serverWalletAddress = data.serverWallet;
    srvPubkey.innerText = serverWalletAddress;
    srvPubkey.title = serverWalletAddress;
    // Keep the Send & Direct panels' server display in sync
    if (sendServerDisplay) {
      sendServerDisplay.innerText = serverWalletAddress;
      sendServerDisplay.title = serverWalletAddress;
    }
    if (directServerDisplay) {
      directServerDisplay.innerText = serverWalletAddress;
      directServerDisplay.title = serverWalletAddress;
    }
    
    srvSol.innerText = data.solBalance.toFixed(4);
    srvUsdcBase.innerText = data.baseWsolBalance.toFixed(4);
    srvUsdcPer.innerText = data.ephemeralWsolBalance.toFixed(4);
    
    log('Server balance diagnostics updated successfully.', 'success');
  } catch (err) {
    log(`Failed to fetch server balance diagnostics: ${err.message}`, 'error');
    srvPubkey.innerText = 'Error loading stats';
  }
}

// Refresh User Stats
async function refreshUserStats() {
  if (!userWallet) return;
  
  try {
    log('Refreshing user balances...', 'info');
    userSol.innerText = 'Loading...';

    // 1. Fetch SOL Balance
    const solLamports = await connection.getBalance(userWallet);
    userSol.innerText = (solLamports / solanaWeb3.LAMPORTS_PER_SOL).toFixed(4);
    
    // 2. Fetch Base WSOL Balance
    userUsdcBase.innerText = 'Loading...';
    const mintPubkey = new solanaWeb3.PublicKey(WSOL_DEVNET_MINT);
    const userATA = getAssociatedTokenAddress(userWallet, mintPubkey);
    
    try {
      const tokenBal = await connection.getTokenAccountBalance(userATA);
      userUsdcBase.innerText = (parseInt(tokenBal.value.amount, 10) / 1_000_000_000).toFixed(4);
    } catch (ataErr) {
      userUsdcBase.innerText = '0.0000'; // account doesn't exist
    }
    
    // 3. Fetch Ephemeral SOL Balance (PER)
    if (userToken && Date.now() < userTokenExpiry) {
      userUsdcPer.innerText = 'Loading...';
      const pubkeyStr = userWallet.toBase58();
      
      const res = await fetch(`${MAGICBLOCK_API_URL}/v1/spl/private-balance?address=${pubkeyStr}&mint=${WSOL_DEVNET_MINT}&cluster=devnet`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      if (!res.ok) {
        throw new Error(`PER API balance check failed: ${res.status}`);
      }
      
      const balData = await res.json();
      const rawBal = parseInt(balData.balance, 10) || 0;
      userUsdcPer.innerText = (rawBal / 1_000_000_000).toFixed(4);
      log(`PER Private balance loaded: ${rawBal / 1_000_000_000} SOL`, 'success');
    } else {
      userUsdcPer.innerText = 'Login Required';
      userUsdcPer.className = 'stat-val font-mono font-accent-purple muted-style';
    }
    
    log('User balances updated.', 'success');
  } catch (err) {
    log(`Failed to refresh user stats: ${err.message}`, 'error');
  }
}

// Magicblock PER Auth Login
btnPerLogin.addEventListener('click', async () => {
  if (!userWallet) return;
  
  try {
    log('Initiating Magicblock challenge login...', 'info');
    const pubkeyStr = userWallet.toBase58();
    
    // Request challenge
    const chalRes = await fetch(`${MAGICBLOCK_API_URL}/v1/spl/challenge?pubkey=${pubkeyStr}&cluster=devnet`);
    if (!chalRes.ok) {
      throw new Error(`Challenge API failed with status ${chalRes.status}`);
    }
    const chalData = await chalRes.json();
    const challenge = chalData.challenge;
    log(`Challenge received: "${challenge.substring(0, 15)}..."`, 'info');
    
    // Sign challenge with Phantom
    log('Prompting signature in wallet...', 'info');
    const encodedMessage = new TextEncoder().encode(challenge);
    const signedMessage = await window.solana.signMessage(encodedMessage, "utf8");
    const signatureBase58 = bufferToBase58(signedMessage.signature);
    log('Challenge signed successfully.', 'success');
    
    // Submit Login
    log('Exchanging signature for Bearer token...', 'info');
    const loginRes = await fetch(`${MAGICBLOCK_API_URL}/v1/spl/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pubkey: pubkeyStr,
        challenge,
        signature: signatureBase58,
        cluster: 'devnet'
      })
    });
    
    if (!loginRes.ok) {
      throw new Error(`Login exchange failed with status ${loginRes.status}`);
    }
    
    const loginData = await loginRes.json();
    userToken = loginData.token;
    // Set 25 min expiry
    userTokenExpiry = Date.now() + 25 * 60 * 1000;
    
    // Update UI Badge
    authStatusBadge.innerText = 'Authenticated';
    authStatusBadge.className = 'badge badge-success';
    
    expiryContainer.classList.remove('hidden');
    
    // Expiry timer update
    const updateExpiryText = () => {
      const rem = userTokenExpiry - Date.now();
      if (rem <= 0) {
        authTokenExpiry.innerText = 'Expired';
        authStatusBadge.innerText = 'Expired';
        authStatusBadge.className = 'badge badge-error';
        userToken = null;
      } else {
        const mins = Math.floor(rem / 60000);
        const secs = Math.floor((rem % 60000) / 1000);
        authTokenExpiry.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        setTimeout(updateExpiryText, 1000);
      }
    };
    updateExpiryText();
    
    log('Authenticated with PER. You can now fetch private balances.', 'success');
    
    // Refresh User Balances
    await refreshUserStats();
  } catch (err) {
    log(`Authentication failed: ${err.message}`, 'error');
  }
});

// Shield (Deposit) SOL into PER (using transfer self-call with wrapAndUnwrapSol: true)
btnDeposit.addEventListener('click', async () => {
  if (!userWallet) return;
  
  const uiAmount = parseFloat(inputDepositAmount.value);
  if (isNaN(uiAmount) || uiAmount <= 0) {
    alert('Please enter a valid deposit amount.');
    return;
  }
  
  const baseUnits = Math.round(uiAmount * 1_000_000_000);
  
  try {
    log(`Requesting deposit transaction from Magicblock API for ${uiAmount} SOL (${baseUnits} base units)...`, 'info');
    
    const payload = {
      from: userWallet.toBase58(),
      to: userWallet.toBase58(),
      mint: WSOL_DEVNET_MINT,
      amount: baseUnits,
      fromBalance: 'base',
      toBalance: 'ephemeral',
      visibility: 'private',
      wrapAndUnwrapSol: true,
      cluster: 'devnet',
      initIfMissing: true,
      initAtasIfMissing: true,
      initVaultIfMissing: true
    };
    
    const res = await fetch(`${MAGICBLOCK_API_URL}/v1/spl/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }
    
    const resData = await res.json();
    log('Deposit transaction built. Prompting signature...', 'info');

    // Use the RPC endpoint the API tells us to broadcast to
    const sendRpc = resData.sendRpcEndpoint || SOLANA_DEVNET_RPC;
    const broadcastConn = new solanaWeb3.Connection(sendRpc, 'confirmed');

    // Deserialize transaction
    const txBuffer = Uint8Array.from(window.atob(resData.transactionBase64), c => c.charCodeAt(0));
    let signature;

    if (resData.version === 'v0') {
      const tx = solanaWeb3.VersionedTransaction.deserialize(txBuffer);
      const signedTx = await window.solana.signTransaction(tx);
      log(`Transaction signed. Broadcasting to ${sendRpc}...`, 'info');
      signature = await broadcastConn.sendTransaction(signedTx, { skipPreflight: true });
    } else {
      const tx = solanaWeb3.Transaction.from(txBuffer);
      const signedTx = await window.solana.signTransaction(tx);
      log(`Transaction signed. Broadcasting to ${sendRpc}...`, 'info');
      signature = await broadcastConn.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
    }

    log(`Transaction broadcasted. Signature: ${signature}`, 'info', signature);
    log('Confirming transaction...', 'info');

    const latestBlock = await broadcastConn.getLatestBlockhash();
    await broadcastConn.confirmTransaction({
      blockhash: latestBlock.blockhash,
      lastValidBlockHeight: latestBlock.lastValidBlockHeight,
      signature
    });

    log('SOL deposit (Shielding) confirmed successfully!', 'success');

    setTimeout(async () => {
      await refreshUserStats();
      await refreshServerStats();
    }, 2000);

  } catch (err) {
    log(`Deposit failed: ${err.message || err}`, 'error');
  }
});

// Unshield (Withdraw) SOL from PER (using transfer self-call with wrapAndUnwrapSol: true)
btnWithdraw.addEventListener('click', async () => {
  if (!userWallet) return;
  
  const uiAmount = parseFloat(inputWithdrawAmount.value);
  if (isNaN(uiAmount) || uiAmount <= 0) {
    alert('Please enter a valid withdrawal amount.');
    return;
  }
  
  const baseUnits = Math.round(uiAmount * 1_000_000_000);
  
  try {
    log(`Requesting withdrawal transaction for ${uiAmount} SOL (${baseUnits} base units)...`, 'info');
    
    const payload = {
      from: userWallet.toBase58(),
      to: userWallet.toBase58(),
      mint: WSOL_DEVNET_MINT,
      amount: baseUnits,
      fromBalance: 'ephemeral',
      toBalance: 'base',
      visibility: 'private',
      wrapAndUnwrapSol: true,
      cluster: 'devnet',
      initIfMissing: true,
      initAtasIfMissing: true,
      initVaultIfMissing: true
    };
    
    const res = await fetch(`${MAGICBLOCK_API_URL}/v1/spl/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }
    
    const resData = await res.json();
    log('Withdrawal transaction built. Prompting signature...', 'info');

    // Use the RPC endpoint the API tells us to broadcast to
    const sendRpc = resData.sendRpcEndpoint || SOLANA_DEVNET_RPC;
    const broadcastConn = new solanaWeb3.Connection(sendRpc, 'confirmed');

    // Deserialize transaction
    const txBuffer = Uint8Array.from(window.atob(resData.transactionBase64), c => c.charCodeAt(0));
    let signature;

    if (resData.version === 'v0') {
      const tx = solanaWeb3.VersionedTransaction.deserialize(txBuffer);
      const signedTx = await window.solana.signTransaction(tx);
      log(`Transaction signed. Broadcasting to ${sendRpc}...`, 'info');
      signature = await broadcastConn.sendTransaction(signedTx, { skipPreflight: true });
    } else {
      const tx = solanaWeb3.Transaction.from(txBuffer);
      const signedTx = await window.solana.signTransaction(tx);
      log(`Transaction signed. Broadcasting to ${sendRpc}...`, 'info');
      signature = await broadcastConn.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
    }

    log(`Transaction broadcasted. Signature: ${signature}`, 'info', signature);
    log('Confirming transaction...', 'info');

    const latestBlock = await broadcastConn.getLatestBlockhash();
    await broadcastConn.confirmTransaction({
      blockhash: latestBlock.blockhash,
      lastValidBlockHeight: latestBlock.lastValidBlockHeight,
      signature
    });

    log('SOL withdrawal (Unshielding) confirmed successfully!', 'success');

    setTimeout(async () => {
      await refreshUserStats();
      await refreshServerStats();
    }, 2000);

  } catch (err) {
    log(`Withdrawal failed: ${err.message || err}`, 'error');
  }
});
// Direct Bet SOL from User Base → Server PER (private transfer with wrapAndUnwrapSol: true)
btnDirect.addEventListener('click', async () => {
  if (!userWallet) return;

  if (!serverWalletAddress) {
    log('Server wallet address not loaded yet. Try refreshing server status first.', 'warning');
    return;
  }

  const uiAmount = parseFloat(inputDirectAmount.value);
  if (isNaN(uiAmount) || uiAmount <= 0) {
    alert('Please enter a valid bet amount.');
    return;
  }

  const baseUnits = Math.round(uiAmount * 1_000_000_000);

  try {
    log(`🎮 Placing direct bet of ${uiAmount} SOL (Base → Server PER)...`, 'info');

    // Build the transfer payload: from base -> to ephemeral, private
    const payload = {
      from: userWallet.toBase58(),
      to: serverWalletAddress,
      mint: WSOL_DEVNET_MINT,
      amount: baseUnits,
      visibility: 'private',
      fromBalance: 'base',
      toBalance: 'ephemeral',
      cluster: 'devnet',
      wrapAndUnwrapSol: true,
      initIfMissing: false,
      initAtasIfMissing: true,
      initVaultIfMissing: false
    };

    const res = await fetch(`${MAGICBLOCK_API_URL}/v1/spl/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error?.message || errData.message || `HTTP ${res.status}`);
    }

    const resData = await res.json();
    log('Direct Bet transaction built by Magicblock API. Prompting wallet signature...', 'info');

    // Deserialize and sign
    const txBuffer = Uint8Array.from(window.atob(resData.transactionBase64), c => c.charCodeAt(0));
    let signature;

    // Direct Bet transfers (from base) settle on-chain, so we broadcast to the standard devnet RPC connection
    const broadcastConnection = connection;

    if (resData.version === 'v0') {
      const tx = solanaWeb3.VersionedTransaction.deserialize(txBuffer);
      const signedTx = await window.solana.signTransaction(tx);
      log(`Broadcasting to Solana Devnet...`, 'info');
      signature = await broadcastConnection.sendTransaction(signedTx, { skipPreflight: true });
    } else {
      const tx = solanaWeb3.Transaction.from(txBuffer);
      const signedTx = await window.solana.signTransaction(tx);
      log(`Broadcasting to Solana Devnet...`, 'info');
      signature = await broadcastConnection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
    }

    log(`Transaction broadcasted. Confirming...`, 'info', signature);

    const latestBlock = await broadcastConnection.getLatestBlockhash();
    await broadcastConnection.confirmTransaction({
      blockhash: latestBlock.blockhash,
      lastValidBlockHeight: latestBlock.lastValidBlockHeight,
      signature
    });

    log(`✅ Direct Bet confirmed! ${uiAmount} SOL wagered from Base → Server PER.`, 'success');

    // Refresh stats
    setTimeout(async () => {
      await refreshUserStats();
      await refreshServerStats();
    }, 2500);

  } catch (err) {
    log(`Direct Bet failed: ${err.message}`, 'error');
  }
});

// Send SOL from User PER → Server PER (private ephemeral-to-ephemeral)
btnSend.addEventListener('click', async () => {
  if (!userWallet) return;

  if (!serverWalletAddress) {
    log('Server wallet address not loaded yet. Try refreshing server status first.', 'warning');
    return;
  }

  const uiAmount = parseFloat(inputSendAmount.value);
  if (isNaN(uiAmount) || uiAmount <= 0) {
    alert('Please enter a valid amount to send.');
    return;
  }

  const baseUnits = Math.round(uiAmount * 1_000_000_000);

  try {
    log(`🎮 Sending ${uiAmount} SOL from your PER → Server PER (private transfer)...`, 'info');

    // Build the transfer payload: user ephemeral → server ephemeral, private
    const payload = {
      from: userWallet.toBase58(),
      to: serverWalletAddress,
      mint: WSOL_DEVNET_MINT,
      amount: baseUnits,
      visibility: 'private',
      fromBalance: 'ephemeral',
      toBalance: 'ephemeral',
      cluster: 'devnet',
      wrapAndUnwrapSol: true,
      initIfMissing: true,
      initAtasIfMissing: true,
      initVaultIfMissing: true
    };

    // Auth header is required when connecting to the Private ER
    const headers = { 'Content-Type': 'application/json' };
    if (userToken && Date.now() < userTokenExpiry) {
      headers['Authorization'] = `Bearer ${userToken}`;
    } else {
      log('⚠️  No valid PER auth token. Authenticate first for best results.', 'warning');
    }

    const res = await fetch(`${MAGICBLOCK_API_URL}/v1/spl/transfer`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error?.message || errData.message || `HTTP ${res.status}`);
    }

    const resData = await res.json();
    log('Transfer transaction built by Magicblock API. Prompting wallet signature...', 'info');

    // Deserialize and sign
    const txBuffer = Uint8Array.from(window.atob(resData.transactionBase64), c => c.charCodeAt(0));
    let signature;

    // Determine which RPC endpoint to broadcast on
    const sendRpc = resData.sendRpcEndpoint || SOLANA_DEVNET_RPC;
    const broadcastConnection = new solanaWeb3.Connection(sendRpc, 'confirmed');

    if (resData.version === 'v0') {
      const tx = solanaWeb3.VersionedTransaction.deserialize(txBuffer);
      const signedTx = await window.solana.signTransaction(tx);
      log(`Broadcasting to ${sendRpc}...`, 'info');
      signature = await broadcastConnection.sendTransaction(signedTx, { skipPreflight: true });
    } else {
      const tx = solanaWeb3.Transaction.from(txBuffer);
      const signedTx = await window.solana.signTransaction(tx);
      log(`Broadcasting to ${sendRpc}...`, 'info');
      signature = await broadcastConnection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });
    }

    log(`Transaction broadcasted. Confirming...`, 'info', signature);

    const latestBlock = await broadcastConnection.getLatestBlockhash();
    await broadcastConnection.confirmTransaction({
      blockhash: latestBlock.blockhash,
      lastValidBlockHeight: latestBlock.lastValidBlockHeight,
      signature
    });

    log(`✅ Private transfer confirmed! ${uiAmount} USDC sent to Server PER.`, 'success');
    log(`Server's ephemeral balance should increase by ${uiAmount} USDC.`, 'info');

    // Refresh balances after a moment
    setTimeout(async () => {
      await refreshUserStats();
      await refreshServerStats();
    }, 2500);

  } catch (err) {
    log(`Send to server failed: ${err.message}`, 'error');
    if (err.message.includes('not deposited') || err.message.includes('not initialized')) {
      log('💡 Make sure BOTH your wallet AND the server wallet have deposited into the PER first.', 'warning');
    }
  }
});

// Trigger Reward Distribution POST
btnTriggerReward.addEventListener('click', async () => {
  const recipient = inputRewardRecipient.value.trim();
  const score = parseInt(inputRewardScore.value, 10);
  const mode = selectRewardMode.value;
  const bonus = parseFloat(inputRewardBonus.value) || 0;
  const bet = parseFloat(inputRewardBet.value) || 0;
  const valToken = inputValidationToken.value.trim();
  
  if (!recipient) {
    alert('Please enter a recipient Solana address.');
    return;
  }
  
  try {
    log(`Triggering reward distribution API (/distribute) to recipient: ${recipient}...`, 'info');
    
    const response = await fetch('/distribute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Unity-Validation': valToken
      },
      body: JSON.stringify({
        address: recipient,
        score,
        mode,
        bonus_sol: bonus,
        bet_amount: bet
      })
    });
    
    const resData = await response.json();
    
    if (!response.ok) {
      throw new Error(resData.message || resData.error || `HTTP ${response.status}`);
    }
    
    log(`Reward distributed! Status: OK. Amount: ${resData.data.amount} USDC`, 'success');
    log(`Tx Signature: ${resData.data.transaction}`, 'success', resData.data.transaction);
    log(`Base Reward: ${resData.data.breakdown.baseReward} USDC | Combo Bonus: ${resData.data.breakdown.bonus} USDC`, 'info');
    
    // Refresh stats
    setTimeout(async () => {
      await refreshServerStats();
      await refreshUserStats();
    }, 2000);
  } catch (err) {
    log(`Reward distribution failed: ${err.message}`, 'error');
  }
});

// Event Listeners on Estimate Fields
inputRewardScore.addEventListener('input', updateEstimation);
selectRewardMode.addEventListener('change', updateEstimation);
inputRewardBonus.addEventListener('input', updateEstimation);
inputRewardBet.addEventListener('input', updateEstimation);
btnRefreshServer.addEventListener('click', refreshServerStats);
btnRefreshUser.addEventListener('click', refreshUserStats);

// Page Load Initializations
window.addEventListener('load', async () => {
  updateEstimation();
  await refreshServerStats();
});
