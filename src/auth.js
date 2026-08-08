import { parseCSV } from './csvParser.js';

const STORAGE_AUTH_SESSION_KEY = 'ticket_scanner_auth_session_v1';
const STORAGE_SHEET2_URL_KEY = 'ticket_scanner_sheet2_url_v1';

export let sheet2AuthUrl = localStorage.getItem(STORAGE_SHEET2_URL_KEY) || '';

// System Fallback Accounts (Instant access offline or before Sheet 2 URL is loaded)
const SYSTEM_ACCOUNTS = [
  {
    username: 'rjulappa@gitam.in',
    name: 'R. Julappa',
    role: 'ticketing',
    password: '110120'
  },
  {
    username: 'pamarnat@gitam.edu',
    name: 'P. Amarnath',
    role: 'admin',
    password: '67pamarnat67'
  },
  {
    username: 'directorcampuslife_blr@gitam.edu',
    name: 'Director Campus Life (BLR)',
    role: 'super_admin',
    password: 'DoCLEncoreGitam'
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
    SYSTEM_ACCOUNTS.forEach(acc => {
      this.authUsers.set(acc.username.toLowerCase(), acc);
    });
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
   * Reads credentials directly from Sheet 2 CSV
   * Expected columns:
   * Col 1: email id
   * Col 2: role (super admin, admin, security)
   * Col 3: password
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

      // Re-init with default accounts first
      this.initAccounts();

      const emailCol = headers.findIndex(h => h.toLowerCase().includes('email') || h.toLowerCase().includes('user') || h.toLowerCase().includes('id'));
      const roleCol = headers.findIndex(h => h.toLowerCase().includes('role'));
      const passCol = headers.findIndex(h => h.toLowerCase().includes('pass'));

      records.forEach(r => {
        const rawRow = r.rawRow || [];
        const email = emailCol !== -1 ? rawRow[emailCol] : (rawRow[0] || r.email || r.regdNo || '');
        const roleRaw = roleCol !== -1 ? rawRow[roleCol] : (rawRow[1] || 'security');
        const password = passCol !== -1 ? rawRow[passCol] : (rawRow[2] || rawRow[1] || '');

        if (email && password) {
          const cleanEmail = email.trim().toLowerCase();
          const cleanRoleStr = roleRaw.trim().toLowerCase();
          const cleanPass = password.trim();

          let normalizedRole = 'ticketing';
          if (cleanRoleStr.includes('super')) normalizedRole = 'super_admin';
          else if (cleanRoleStr.includes('admin')) normalizedRole = 'admin';
          else if (cleanRoleStr.includes('security') || cleanRoleStr.includes('ticket')) normalizedRole = 'ticketing';

          this.authUsers.set(cleanEmail, {
            username: email.trim(),
            password: cleanPass,
            role: normalizedRole,
            name: email.trim().split('@')[0]
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
   * Live Login verification against Sheet 2 loaded credentials
   */
  async login(usernameInput, passwordInput) {
    const cleanUser = usernameInput ? usernameInput.trim().toLowerCase() : '';
    const plainPassword = passwordInput ? passwordInput.trim() : '';

    if (!cleanUser || !plainPassword) {
      return { success: false, error: 'Please enter both email and password.' };
    }

    // Always trigger background sync from Sheet 2 if configured
    if (sheet2AuthUrl) {
      try {
        await this.loadAuthSheet(sheet2AuthUrl);
      } catch (e) {
        console.warn('Sheet 2 sync fallback:', e);
      }
    }

    // Direct match against Sheet 2 accounts
    if (this.authUsers.has(cleanUser)) {
      const userObj = this.authUsers.get(cleanUser);
      
      if (userObj.password === plainPassword) {
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

    return { success: false, error: 'Invalid email or password.' };
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem(STORAGE_AUTH_SESSION_KEY);
  }
}

export const auth = new AuthManager();
