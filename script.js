const header = document.querySelector('.site-header');
const menuToggle = document.querySelector('.menu-toggle');
const mobileMenu = document.querySelector('.mobile-menu');

const setScrolled = () => header?.classList.toggle('scrolled', window.scrollY > 12);
setScrolled();
window.addEventListener('scroll', setScrolled, { passive: true });

menuToggle?.addEventListener('click', () => {
  const open = mobileMenu.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.querySelector('b').textContent = open ? 'Close menu' : 'Open menu';
});
mobileMenu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  mobileMenu.classList.remove('open');
  menuToggle?.setAttribute('aria-expanded', 'false');
}));

// ============ WALLET CONNECTIVITY ============
let connectedAddress = null;
let connectedChainId = null;
let provider = null;
let walletConnected = false;

const walletConnectBtn = document.getElementById('wallet-connect');
const walletDisconnectBtn = document.getElementById('wallet-disconnect');
const addressDisplay = document.getElementById('connected-address');
const chainDisplay = document.getElementById('connected-chain');
const statusDisplay = document.getElementById('wallet-status');
const networkSelector = document.getElementById('network-selector');
const networkBadge = document.querySelector('.network-badge');

function formatChainId(id) {
  const n = Number(id);
  if (n === 1) return 'Ethereum Mainnet';
  if (n === 70) return 'Robinhood Chain';
  if (n === 42161) return 'Arbitrum One';
  if (n === 137) return 'Polygon';
  if (n === 56) return 'BNB Chain';
  return 'Chain ' + id;
}

async function connectWallet() {
  if (!window.ethereum) {
    alert('No Ethereum provider detected. Please install MetaMask or use WalletConnect.');
    return;
  }
  try {
    provider = window.ethereum;
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) throw new Error('No accounts');
    connectedAddress = accounts[0];
    walletConnected = true;
    addressDisplay.textContent = connectedAddress.slice(0, 6) + '...' + connectedAddress.slice(-4);
    addressDisplay.classList.add('connected');

    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    connectedChainId = chainId;
    const chainName = formatChainId(chainId);
    chainDisplay.textContent = chainName;
    chainDisplay.classList.add('connected');

    // If not on Robinhood Chain, attempt to switch
    if (chainId !== '0x70' && chainId !== 70) {
      try {
        await window.ethereum.request({ method: 'wallet_switchEthereumChain', chainId: '0x70' });
      } catch (e) {
        // Robinhood Chain not yet added - show option to add
        if (!window.confirm('Robinhood Chain not connected. Add now?')) return;
        try {
          await window.ethereum.request({ method: 'addEthereumChain', params: [
            { chainId: '0x70', rpcUrls: ['https://rpc.robinhoodchain.com'], chainName: 'Robinhood Chain', nativeCurrency: { name: 'RH', symbol: 'RH', decimals: 18 }, explorerUrls: ['https://explorer.robinhoodchain.com'] }
          ]});
        } catch (e2) {
          alert('Could not add Robinhood Chain: ' + (e2.message || e2));
        }
      }
    }

    updateWalletUI();
    loadDashboardData();

    window.ethereum.on('accountsChanged', (accounts) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        connectedAddress = accounts[0];
        addressDisplay.textContent = accounts[0].slice(0, 6) + '...' + accounts[0].slice(-4);
      }
    });

    window.ethereum.on('chainChanged', (chainId) => {
      connectedChainId = chainId;
      chainDisplay.textContent = formatChainId(chainId);
      loadDashboardData();
    });
  } catch (err) {
    console.error('Wallet connection error:', err);
    alert('Connection failed: ' + (err.message || 'Unknown error'));
  }
}

function disconnectWallet() {
  connectedAddress = null;
  connectedChainId = null;
  walletConnected = false;
  addressDisplay.textContent = 'Not connected';
  addressDisplay.classList.remove('connected');
  chainDisplay.textContent = 'Not connected';
  chainDisplay.classList.remove('connected');
  updateWalletUI();
}

function updateWalletUI() {
  if (walletConnected && connectedAddress) {
    walletConnectBtn.hidden = true;
    walletDisconnectBtn.hidden = false;
    statusDisplay.textContent = 'Connected';
    statusDisplay.classList.add('connected');
  } else {
    walletConnectBtn.hidden = false;
    walletDisconnectBtn.hidden = true;
    statusDisplay.textContent = 'Disconnected';
    statusDisplay.classList.remove('connected');
  }
}

// ============ DASHBOARD NAVIGATION ============
document.addEventListener('DOMContentLoaded', () => {
  updateWalletUI();

  // Network selector setup with Robinhood Chain
  if (networkSelector) {
    // Pre-select Robinhood Chain option
    const rhOption = networkSelector.querySelector('option[value="0x70"]');
    if (rhOption) rhOption.selected = true;

    networkSelector.addEventListener('change', (e) => {
      const targetChain = e.target.value;
      if (targetChain && window.ethereum) {
        try {
          window.ethereum.request({ method: 'wallet_switchEthereumChain', chainId: targetChain });
        } catch (err) {
          const code = Number(targetChain);
          if (code === 70) {
            window.ethereum.request({ method: 'addEthereumChain', params: [
              { chainId: '0x70', rpcUrls: ['https://rpc.robinhoodchain.com'], chainName: 'Robinhood Chain', nativeCurrency: { name: 'RH', symbol: 'RH', decimals: 18 }, explorerUrls: ['https://explorer.robinhoodchain.com'] }
            ]});
          } else {
            alert('Chain switching not fully supported for ' + targetChain);
          }
        }
      }
    });
  }

  // Wallet button listeners
  if (walletConnectBtn) walletConnectBtn.addEventListener('click', connectWallet);
  if (walletDisconnectBtn) walletDisconnectBtn.addEventListener('click', disconnectWallet);

  // Dashboard navigation - highlight active section
  const navLinks = document.querySelectorAll('.desktop-nav a, .mobile-menu a');
  const sections = document.querySelectorAll('section[id]');

  function setActiveNav() {
    let current = '';
    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (pageYOffset >= sectionTop - sectionHeight / 3) {
        current = section.getAttribute('id');
      }
    });
    navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('href') === '#' + current) {
        link.classList.add('active');
      }
    });
  }
  window.addEventListener('scroll', setActiveNav);
  setActiveNav();

  // Nav link clicks
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.getAttribute('href').substring(1);
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (mobileMenu.classList.contains('open')) {
        mobileMenu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
      }
    });
  });
});

// ============ DASHBOARD DATA LOADING ============
async function loadDashboardData() {
  if (window.prismpay && window.prismpay.showLoading) {
    window.prismpay.showLoading(true);
  }
  const networkName = formatChainId(connectedChainId || 70);
  if (window.prismpay && window.prismpay.updateNetworkBadge) {
    const nb = document.querySelector('.network-badge');
    if (nb) nb.textContent = 'Network: ' + networkName;
  }
  if (walletConnected && connectedAddress) {
    await updateBalances();
  }
  if (window.prismpay && window.prismpay.showLoading) {
    window.prismpay.showLoading(false);
  }
}

async function updateBalances() {
  if (!connectedAddress || !provider) return;
  try {
    const ethBalanceWei = await provider.request({ method: 'eth_getBalance', params: [connectedAddress, 'latest'] });
    const ethBalance = Number(ethBalanceWei) / 1e18;
    const balanceEth = document.querySelector('.balance-eth');
    if (balanceEth) balanceEth.textContent = ethBalance.toFixed(4) + ' RH';

    // Token balances for Robinhood Chain (illustrative contracts)
    const tokenContracts = {
      RH: '0x0000000000000000000000000000000000000005', // Native token
    };
    for (const [symbol, contract] of Object.entries(tokenContracts)) {
      const balanceToken = document.querySelector('.balance-' + symbol.toLowerCase());
      if (balanceToken) balanceToken.textContent = ethBalance.toFixed(2) + ' RH';
    }
  } catch (err) {
    console.error('Balance fetch error:', err);
  }
}

// ============ CRYPTO PAYMENTS ============
function createPaymentFlow() {
  const paymentSection = document.getElementById('payments');
  if (!paymentSection) return;

  function createPaymentUI() {
    const ui = document.createElement('div');
    ui.className = 'dashboard-card';
    ui.innerHTML = `
      <h3>Send Crypto</h3>
      <div class="payment-form">
        <div class="form-row">
          <label>Amount</label>
          <input type="number" id="payment-amount" step="any" placeholder="0" required>
          <span class="token-symbol">RH</span>
        </div>
        <div class="form-row">
          <label>Recipient</label>
          <input type="address" id="payment-recipient" placeholder="0x..." required>
        </div>
        <div class="form-row">
          <label>Network</label>
          <select id="payment-network">
            <option value="0x1">Ethereum Mainnet</option>
            <option value="0x70" selected>Robinhood Chain</option>
          </select>
        </div>
        <button class="button button-primary" id="confirm-payment">Confirm and Send</button>
      </div>
    `;
    paymentSection.innerHTML = '';
    paymentSection.appendChild(ui);

    const amountInput = ui.querySelector('#payment-amount');
    const recipientInput = ui.querySelector('#payment-recipient');
    const confirmBtn = ui.querySelector('#confirm-payment');

    function updateSendButton() {
      const hasAmount = amountInput.value && Number(amountInput.value) > 0;
      const hasRecipient = recipientInput.value && recipientInput.value.startsWith('0x');
      confirmBtn.disabled = !hasAmount || !hasRecipient;
    }
    amountInput.addEventListener('input', updateSendButton);
    recipientInput.addEventListener('input', updateSendButton);
  }
  createPaymentUI();
}

// ============ SWAP FUNCTIONALITY ============
function initSwap() {
  const swapSection = document.getElementById('swap');
  if (!swapSection) return;

  function createSwapUI() {
    const ui = document.createElement('div');
    ui.className = 'dashboard-card';
    ui.innerHTML = `
      <h3>Swap Assets</h3>
      <div class="swap-form">
        <div class="form-row">
          <label>From</label>
          <select id="swap-from-token">
            <option value="RH">Robinhood RH</option>
            <option value="USDC">USD Coin</option>
            <option value="USDT">Tether USD</option>
          </select>
        </div>
        <div class="form-row">
          <label>To</label>
          <select id="swap-to-token">
            <option value="USDC">USD Coin</option>
            <option value="USDT">Tether USD</option>
            <option value="RH">Robinhood RH</option>
          </select>
        </div>
        <div class="form-row">
          <label>Amount</label>
          <input type="number" id="swap-amount" step="any" placeholder="0" required>
        </div>
        <div class="form-row">
          <label>Estimated Output</label>
          <output id="swap-output">—</output>
        </div>
        <button class="button button-primary" id="confirm-swap">Swap</button>
        <small class="swap-note">Estimated output is illustrative — actual amounts depend on liquidity and route.</small>
      </div>
    `;
    swapSection.innerHTML = '';
    swapSection.appendChild(ui);

    const fromSelect = ui.querySelector('#swap-from-token');
    const toSelect = ui.querySelector('#swap-to-token');
    const amountInput = ui.querySelector('#swap-amount');
    const outputDisplay = ui.querySelector('#swap-output');
    const confirmBtn = ui.querySelector('#confirm-swap');

    function updateSwapUI() {
      const hasAmount = amountInput.value && Number(amountInput.value) > 0;
      confirmBtn.disabled = !hasAmount;
    }

    fromSelect.addEventListener('change', () => {
      const amount = Number(amountInput.value);
      if (amount > 0 && fromSelect.value && toSelect.value && fromSelect.value !== toSelect.value) {
        outputDisplay.textContent = '(' + amount.toFixed(2) + ' ' + fromSelect.value + ' → ~' + amount.toFixed(2) + ' ' + toSelect.value + ') Example';
        outputDisplay.style.color = '#9aa8cb';
      } else {
        outputDisplay.textContent = '—';
        outputDisplay.style.color = '';
      }
      updateSwapUI();
    });
    amountInput.addEventListener('input', updateSwapUI);

    confirmBtn.addEventListener('click', async () => {
      const amount = Number(amountInput.value);
      if (amount <= 0) return;
      outputDisplay.textContent = 'Processing swap...';
      outputDisplay.style.color = '#64f4db';
      await new Promise(r => setTimeout(r, 1500));
      outputDisplay.textContent = 'Illustrative result: ' + amount.toFixed(2) + ' ' + fromSelect.value + ' → ' + (amount * 0.95).toFixed(2) + ' ' + toSelect.value;
      outputDisplay.style.color = '#64f4db';
      const note = document.createElement('div');
      note.className = 'panel-note';
      note.innerHTML = 'i <span>Illustrative swap — actual output depends on liquidity, fees, and route availability.</span>';
      ui.querySelector('.swap-form').appendChild(note);
    });
  }
  createSwapUI();
}

// Keep the example and illustrative interfaces local: no real wallet/quote/transaction calls without backend integration and user confirmation.