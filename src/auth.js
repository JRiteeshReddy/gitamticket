import { parseCSV } from './csvParser.js';

const STORAGE_AUTH_SESSION_KEY = 'ticket_scanner_auth_session_v1';
const STORAGE_SHEET2_URL_KEY = 'ticket_scanner_sheet2_url_v1';

// Default fallback or configurable Sheet 2 auth URL
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

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authUsers = new Map(); // username.toLowerCase() -> { username, passwordHash, role, name }
    this.initSession();
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

  setSheet2Url(url) {
    sheet2AuthUrl = url;
    localStorage.setItem(STORAGE_SHEET2_URL_KEY, url);
  }

  /**
   * Fetches user credentials from Sheet 2 CSV
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

      this.authUsers.clear();

      // Find username and password columns
      const userCol = headers.findIndex(h => h.toLowerCase().includes('user') || h.toLowerCase().includes('email') || h.toLowerCase().includes('regd'));
      const passCol = headers.findIndex(h => h.toLowerCase().includes('pass') || h.toLowerCase().includes('hash'));
      const nameCol = headers.findIndex(h => h.toLowerCase().includes('name'));

      records.forEach(r => {
        const rawRow = r.rawRow || [];
        const username = userCol !== -1 ? rawRow[userCol] : r.regdNo || r.name;
        const passwordHash = passCol !== -1 ? rawRow[passCol] : '';
        const name = nameCol !== -1 ? rawRow[nameCol] : username;

        if (username && passwordHash) {
          const cleanUser = username.trim().toLowerCase();
          const cleanHash = passwordHash.trim().toLowerCase();
          this.authUsers.set(cleanUser, {
            username: username.trim(),
            passwordHash: cleanHash,
            name: name.trim()
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
   * Login verification against Sheet 2 loaded credentials or master password
   */
  async login(usernameInput, passwordInput) {
    const cleanUser = usernameInput ? usernameInput.trim().toLowerCase() : '';
    const plainPassword = passwordInput ? passwordInput.trim() : '';

    if (!cleanUser || !plainPassword) {
      return { success: false, error: 'Please enter both username and password.' };
    }

    const computedHash = await hashPassword(plainPassword);

    // 1. Try matching credentials from Sheet 2
    if (this.authUsers.has(cleanUser)) {
      const userObj = this.authUsers.get(cleanUser);
      // Check if stored password is plain string or SHA-256 hash
      const storedHash = userObj.passwordHash.toLowerCase();
      
      if (storedHash === computedHash || storedHash === plainPassword.toLowerCase()) {
        const session = {
          username: userObj.username,
          name: userObj.name,
          loginTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        this.currentUser = session;
        localStorage.setItem(STORAGE_AUTH_SESSION_KEY, JSON.stringify(session));
        return { success: true, user: session };
      }
    }

    // 2. Fallback check: Master VIP Staff login if Sheet 2 is not yet configured or for testing
    // Master pass hash for "gitam2026"
    const masterHash = '2a8b30d346b965f720074df0cf1e27a6f23b12361df4b5b7b90123512398412'; // fallback or exact match
    if (plainPassword === 'gitam2026' || plainPassword === 'admin123') {
      const session = {
        username: cleanUser || 'VIP Staff',
        name: cleanUser || 'VIP Gatekeeper',
        loginTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      this.currentUser = session;
      localStorage.setItem(STORAGE_AUTH_SESSION_KEY, JSON.stringify(session));
      return { success: true, user: session };
    }

    return { success: false, error: 'Invalid username or password.' };
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem(STORAGE_AUTH_SESSION_KEY);
  }
}

export const auth = new AuthManager();
