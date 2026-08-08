import { parseCSV } from './csvParser.js';

const STORAGE_AUTH_SESSION_KEY = 'ticket_scanner_auth_session_v1';
const STORAGE_SHEET2_URL_KEY = 'ticket_scanner_sheet2_url_v1';
const STORAGE_CUSTOM_ADMINS_KEY = 'ticket_scanner_custom_admins_v1';

export let sheet2AuthUrl = localStorage.getItem(STORAGE_SHEET2_URL_KEY) || '';

/**
 * Computes SHA-256 hash of a plain text password using native Web Crypto API.
 */
export async function hashPassword(password) {
  if (!password) return '';
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// System Built-in Accounts (Password hashes precomputed for maximum security)
const SYSTEM_ACCOUNTS = [
  {
    username: 'rjulappa@gitam.in',
    name: 'R. Julappa',
    role: 'ticketing', // Gatekeeper ticketing access
    passwordHash: '34849f5f22e3d3bba2c581c9e69bd1689e90e475151074e017e885e0c0d28bc6' // 110120
  },
  {
    username: 'pamarnat@gitam.edu',
    name: 'P. Amarnath',
    role: 'admin', // Admin access (can create student participants for Sheet 3)
    passwordHash: '75bc69e39686661305c8fcb648280fd42819ba9eb23a100532bff95836896a85' // 67pamarnat67
  },
  {
    username: 'directorcampuslife_blr@gitam.edu',
    name: 'Director Campus Life (BLR)',
    role: 'super_admin', // Super Admin (Overall head, create admins & students)
    passwordHash: '9bc049266c7ce3be2db8687e37fff212669b396fa5a69c9ecbc189e79136d772' // DoCLEncoreGitam
  }
];

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authUsers = new Map(); // username.toLowerCase() -> userObj
    this.initAccounts();
    this.initSession();
  }

  initAccounts() {
    this.authUsers.clear();
    
    // 1. Add System Built-in Accounts
    SYSTEM_ACCOUNTS.forEach(acc => {
      this.authUsers.set(acc.username.toLowerCase(), acc);
    });

    // 2. Add Custom Admins created by Super Admin from localStorage
    try {
      const custom = localStorage.getItem(STORAGE_CUSTOM_ADMINS_KEY);
      if (custom) {
        const parsed = JSON.parse(custom);
        parsed.forEach(acc => {
          this.authUsers.set(acc.username.toLowerCase(), acc);
        });
      }
    } catch (e) {
      console.error('Failed to load custom admin accounts:', e);
    }
  }

  initSession() {
    try {
      const savedSession = localStorage.getItem(STORAGE_AUTH_SESSION_KEY);
      if (savedSession) {
        this.currentUser = JSON.parse(savedSession);
      }
    } catch (e) {
      console.error('Failed to parse auth session:', e);
      this.currentUser = null;
    }
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  hasRole(role) {
    if (!this.currentUser) return false;
    if (this.currentUser.role === 'super_admin') return true;
    if (role === 'admin' && (this.currentUser.role === 'admin' || this.currentUser.role === 'super_admin')) return true;
    return this.currentUser.role === role;
  }

  setSheet2Url(url) {
    sheet2AuthUrl = url;
    localStorage.setItem(STORAGE_SHEET2_URL_KEY, url);
  }

  /**
   * Loads user accounts from Sheet 2 CSV if published
   */
  async loadAuthSheet(url = sheet2AuthUrl) {
    if (!url) return { success: false, count: 0 };
    this.setSheet2Url(url);

    try {
      const fetchUrl = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
      const response = await fetch(fetchUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}: Failed to fetch Sheet 2`);

      const csvText = await response.text();
      const { headers, records } = parseCSV(csvText);

      const userCol = headers.findIndex(h => h.toLowerCase().includes('user') || h.toLowerCase().includes('email') || h.toLowerCase().includes('regd'));
      const passCol = headers.findIndex(h => h.toLowerCase().includes('pass') || h.toLowerCase().includes('hash'));
      const nameCol = headers.findIndex(h => h.toLowerCase().includes('name'));
      const roleCol = headers.findIndex(h => h.toLowerCase().includes('role'));

      records.forEach(r => {
        const rawRow = r.rawRow || [];
        const username = userCol !== -1 ? rawRow[userCol] : r.regdNo || r.name;
        const passwordHash = passCol !== -1 ? rawRow[passCol] : '';
        const name = nameCol !== -1 ? rawRow[nameCol] : username;
        const role = roleCol !== -1 ? rawRow[roleCol] : 'ticketing';

        if (username && passwordHash) {
          const cleanUser = username.trim().toLowerCase();
          const cleanHash = passwordHash.trim().toLowerCase();
          this.authUsers.set(cleanUser, {
            username: username.trim(),
            passwordHash: cleanHash,
            name: name.trim(),
            role: role.trim() || 'ticketing'
          });
        }
      });

      return { success: true, count: this.authUsers.size };
    } catch (err) {
      console.warn('Failed to load Sheet 2 auth users:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Login verification against System accounts & Sheet 2
   */
  async login(usernameInput, passwordInput) {
    const cleanUser = usernameInput ? usernameInput.trim().toLowerCase() : '';
    const plainPassword = passwordInput ? passwordInput.trim() : '';

    if (!cleanUser || !plainPassword) {
      return { success: false, error: 'Please enter both username and password.' };
    }

    const computedHash = await hashPassword(plainPassword);

    // Look up user in authUsers map
    if (this.authUsers.has(cleanUser)) {
      const userObj = this.authUsers.get(cleanUser);
      const storedHash = userObj.passwordHash.toLowerCase();

      if (storedHash === computedHash || storedHash === plainPassword.toLowerCase()) {
        const session = {
          username: userObj.username,
          name: userObj.name,
          role: userObj.role || 'ticketing',
          loginTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        this.currentUser = session;
        localStorage.setItem(STORAGE_AUTH_SESSION_KEY, JSON.stringify(session));
        return { success: true, user: session };
      }
    }

    return { success: false, error: 'Invalid username or password.' };
  }

  /**
   * Create a new Admin or Gatekeeper account (Super Admin capability)
   */
  async createAdminAccount(username, plainPassword, role = 'admin', name = '') {
    if (!this.hasRole('super_admin')) {
      return { success: false, error: 'Permission denied. Only Super Admin can create new admin accounts.' };
    }

    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser || !plainPassword) {
      return { success: false, error: 'Username and Password are required.' };
    }

    const passwordHash = await hashPassword(plainPassword.trim());

    const newAcc = {
      username: username.trim(),
      name: name.trim() || username.trim(),
      role: role,
      passwordHash: passwordHash
    };

    this.authUsers.set(cleanUser, newAcc);

    // Save custom accounts to localStorage
    try {
      const existingCustom = JSON.parse(localStorage.getItem(STORAGE_CUSTOM_ADMINS_KEY) || '[]');
      const filtered = existingCustom.filter(a => a.username.toLowerCase() !== cleanUser);
      filtered.push(newAcc);
      localStorage.setItem(STORAGE_CUSTOM_ADMINS_KEY, JSON.stringify(filtered));
    } catch (e) {
      console.error('Failed to save custom admin account:', e);
    }

    // Sync to Google Apps Script Sheet 2 if configured
    const scriptUrl = localStorage.getItem('ticket_scanner_apps_script_url_v1');
    if (scriptUrl) {
      fetch(scriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addAdmin',
          username: newAcc.username,
          passwordHash: newAcc.passwordHash,
          role: newAcc.role,
          name: newAcc.name
        })
      }).catch(err => console.warn('Failed to sync to Apps Script Sheet 2:', err));
    }

    return { success: true, account: newAcc };
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem(STORAGE_AUTH_SESSION_KEY);
  }
}

export const auth = new AuthManager();
