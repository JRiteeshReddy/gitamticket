import { parseCSV, extractRegdNo } from './csvParser.js';

const STORAGE_SHEET_URL_KEY = 'ticket_scanner_sheet_url_v1';
const STORAGE_CACHED_STUDENTS_KEY = 'ticket_scanner_students_cache_v1';
const STORAGE_CHECKED_IN_KEY = 'ticket_scanner_checked_in_v2';
const STORAGE_LAST_SYNC_KEY = 'ticket_scanner_last_sync_v1';

const STORAGE_SHEET3_NEW_STUDENTS_KEY = 'ticket_scanner_sheet3_new_students_v1';
const STORAGE_APPS_SCRIPT_URL_KEY = 'ticket_scanner_apps_script_url_v1';

export const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz-WbEenFW1lnKrl8mQY8tuvoTYBXw4bC1CFg5y3_foGk7rz9zj8JdQxdTHyFe21_gC/exec';
export let appsScriptUrl = localStorage.getItem(STORAGE_APPS_SCRIPT_URL_KEY) || DEFAULT_APPS_SCRIPT_URL;

export function setAppsScriptUrl(url) {
  appsScriptUrl = url;
  localStorage.setItem(STORAGE_APPS_SCRIPT_URL_KEY, url);
}

// Official student data sheet (Esperanza - Encore 26)
export const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQDXuHhjFIWg1L6uQI8Q3L926DJ9gUbC48jN1olwzA2EtdGGGSipqgh2hHLfYbdI1eHuh6BuFeHKEnF/pub?output=csv';
export const DEFAULT_SHEET3_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTKcsBYzsbP8O58BtbGOvLb5FcHaRc6jDMXn56p9DrbWPohyPs6Le1zomLNaFXRhzApZ7HZ8lEVm17Y/pubhtml/sheet?headers=false&gid=369056435';

class Store {
  constructor() {
    // Always use the default sheet URL (ignores any stale URL saved in localStorage)
    this.sheetUrl = DEFAULT_SHEET_URL;
    localStorage.setItem(STORAGE_SHEET_URL_KEY, DEFAULT_SHEET_URL);
    this.students = [];
    this.sheet3NewStudents = []; // Admin created students (Sheet 3)
    this.studentMap = new Map(); // regdNo -> student
    this.emailMap = new Map();   // email -> student
    this.mobileMap = new Map();  // mobile -> student
    this.checkedInMap = new Map(); // regdNo -> { timestamp, scannedAt, student, method }
    
    this.listeners = new Set();
    this.syncState = {
      loading: false,
      error: null,
      lastSynced: localStorage.getItem(STORAGE_LAST_SYNC_KEY) || null,
      totalCount: 0
    };
    
    this.lastResult = null;
    this.init();
  }

  init() {
    // Load checked-in state from localStorage
    try {
      const savedCheckedIn = localStorage.getItem(STORAGE_CHECKED_IN_KEY);
      if (savedCheckedIn) {
        const parsed = JSON.parse(savedCheckedIn);
        Object.entries(parsed).forEach(([regdNo, entry]) => {
          this.checkedInMap.set(regdNo, entry);
        });
      }
    } catch (e) {
      console.error('Failed to load checked-in state:', e);
    }

    // Load Sheet 3 custom new students created by Admins
    try {
      const savedSheet3 = localStorage.getItem(STORAGE_SHEET3_NEW_STUDENTS_KEY);
      if (savedSheet3) {
        this.sheet3NewStudents = JSON.parse(savedSheet3);
      }
    } catch (e) {
      console.error('Failed to load Sheet 3 students:', e);
    }

    // Load cached students if available
    try {
      const cached = localStorage.getItem(STORAGE_CACHED_STUDENTS_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        this.setStudents(parsed, false);
      }
    } catch (e) {
      console.error('Failed to load cached students:', e);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn(this));
  }

  setStudents(studentList, saveCache = true) {
    // Combine Sheet 1 list with Sheet 3 custom admin-created participants
    const mergedList = [...studentList];
    this.sheet3NewStudents.forEach(s => {
      if (!mergedList.some(existing => existing.regdNo.toLowerCase() === s.regdNo.toLowerCase())) {
        mergedList.push(s);
      }
    });

    this.students = mergedList;
    this.studentMap.clear();
    this.emailMap.clear();
    this.mobileMap.clear();

    mergedList.forEach(student => {
      if (student.regdNo) {
        this.studentMap.set(student.regdNo.toLowerCase(), student);
      }
      if (student.email) {
        this.emailMap.set(student.email.toLowerCase(), student);
      }
      if (student.mobile) {
        this.mobileMap.set(student.mobile.replace(/\D/g, ''), student);
      }
    });

    this.syncState.totalCount = mergedList.length;

    if (saveCache) {
      try {
        localStorage.setItem(STORAGE_CACHED_STUDENTS_KEY, JSON.stringify(studentList));
      } catch (e) {
        console.warn('Storage quota exceeded caching students', e);
      }
    }

    this.notify();
  }

  addSheet3Student(student) {
    if (!student || !student.regdNo) return { success: false, error: 'Registration Number is required.' };
    const cleanRegd = student.regdNo.trim();

    if (this.studentMap.has(cleanRegd.toLowerCase())) {
      return { success: false, error: `Student with Regd No ${cleanRegd} already exists.` };
    }

    const newStudent = {
      regdNo: cleanRegd,
      name: student.name || 'New Participant',
      email: student.email || '',
      mobile: student.mobile || '',
      campusInfo: student.campusInfo || 'Added by Admin',
      event: student.event || 'Esperanza - Encore 26',
      status: 'Approved',
      source: 'Sheet 3 (Admin Created)',
      createdAt: new Date().toISOString()
    };

    // Include in active student list immediately
    this.students.push(newStudent);
    this.studentMap.set(cleanRegd.toLowerCase(), newStudent);
    if (newStudent.email) this.emailMap.set(newStudent.email.toLowerCase(), newStudent);
    if (newStudent.mobile) this.mobileMap.set(newStudent.mobile.replace(/\D/g, ''), newStudent);
    
    this.syncState.totalCount = this.students.length;
    this.notify();

    // Post to Google Apps Script Web App if configured to append to Sheet 3
    if (appsScriptUrl) {
      fetch(appsScriptUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addStudent',
          regdNo: newStudent.regdNo,
          name: newStudent.name,
          email: newStudent.email,
          mobile: newStudent.mobile,
          campusInfo: newStudent.campusInfo
        })
      }).catch(err => console.warn('Failed to sync to Apps Script Sheet 3:', err));
    }

    return { success: true, student: newStudent };
  }

  async loadSheetData(url = this.sheetUrl) {
    this.sheetUrl = url;
    localStorage.setItem(STORAGE_SHEET_URL_KEY, url);

    this.syncState.loading = true;
    this.syncState.error = null;
    this.notify();

    try {
      // Fetch Sheet 1
      const fetchUrl1 = url.includes('?') ? `${url}&_t=${Date.now()}` : `${url}?_t=${Date.now()}`;
      const response1 = await fetch(fetchUrl1);
      
      let allRecords = [];
      if (response1.ok) {
        const csvText1 = await response1.text();
        const { records: rec1 } = parseCSV(csvText1);
        allRecords = allRecords.concat(rec1 || []);
      }

      // Fetch Sheet 3 (Published new students)
      try {
        const response3 = await fetch(`${DEFAULT_SHEET3_URL}&_t=${Date.now()}`);
        if (response3.ok) {
          const csvText3 = await response3.text();
          const { records: rec3 } = parseCSV(csvText3);
          rec3.forEach(s => {
            if (s.regdNo && !allRecords.some(r => r.regdNo.toLowerCase() === s.regdNo.toLowerCase())) {
              allRecords.push({ ...s, source: 'Sheet 3 (Published)' });
            }
          });
        }
      } catch (e3) {
        console.warn('Sheet 3 fetch optional info:', e3);
      }

      if (!allRecords || allRecords.length === 0) {
        throw new Error('No valid student records found in Google Sheet CSV.');
      }

      const nowStr = new Date().toLocaleString();
      this.syncState.lastSynced = nowStr;
      localStorage.setItem(STORAGE_LAST_SYNC_KEY, nowStr);

      this.setStudents(allRecords, true);
      this.syncState.loading = false;
      this.syncState.error = null;
      this.notify();

      return { success: true, count: allRecords.length };
    } catch (err) {
      console.error('Fetch Google Sheet Error:', err);
      this.syncState.loading = false;
      this.syncState.error = err.message || 'Failed to load Google Sheet data.';
      this.notify();
      return { success: false, error: this.syncState.error };
    }
  }

  saveCheckedInState() {
    try {
      const obj = {};
      this.checkedInMap.forEach((val, key) => {
        obj[key] = val;
      });
      localStorage.setItem(STORAGE_CHECKED_IN_KEY, JSON.stringify(obj));
    } catch (e) {
      console.error('Failed to save checked in state:', e);
    }
  }

  findStudent(scannedText) {
    if (!scannedText) return null;
    const cleanText = scannedText.trim();
    const candidateRegd = extractRegdNo(cleanText);

    // 1. Direct regdNo match
    let student = this.studentMap.get(candidateRegd.toLowerCase());
    if (student) return student;

    // 2. Direct regdNo match with full cleanText
    student = this.studentMap.get(cleanText.toLowerCase());
    if (student) return student;

    // 3. Email match
    if (cleanText.includes('@')) {
      student = this.emailMap.get(cleanText.toLowerCase());
      if (student) return student;
    }

    // 4. Mobile match
    const cleanPhone = cleanText.replace(/\D/g, '');
    if (cleanPhone.length >= 10) {
      student = this.mobileMap.get(cleanPhone.slice(-10));
      if (student) return student;
    }

    // 5. Case-insensitive substring search over Regd no
    for (const [key, std] of this.studentMap.entries()) {
      if (key.includes(candidateRegd.toLowerCase()) || candidateRegd.toLowerCase().includes(key)) {
        return std;
      }
    }

    return null;
  }

  /**
   * Process a scanned QR code text.
   * STRICT ENFORCEMENT: If student is already in checkedInMap, returns ALREADY_ENTERED!
   */
  processScan(scannedText, method = 'QR Scan') {
    const cleanText = scannedText ? scannedText.trim() : '';
    const candidateRegd = extractRegdNo(cleanText);
    const student = this.findStudent(cleanText);

    const now = new Date();
    const formattedTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    // Key used for check-in index (prefer matched student regdNo, else candidateRegd)
    const targetRegdNo = student ? student.regdNo : candidateRegd;
    const lookupKey = targetRegdNo.toLowerCase();

    // Check if ALREADY CHECKED IN
    if (this.checkedInMap.has(lookupKey)) {
      const previousEntry = this.checkedInMap.get(lookupKey);
      
      const result = {
        type: 'ALREADY_ENTERED',
        student: student || previousEntry.student,
        regdNo: targetRegdNo,
        scannedText: cleanText,
        previousEntry: previousEntry,
        timestamp: now.toISOString(),
        formattedTime: formattedTime
      };

      this.lastResult = result;
      this.notify();
      return result;
    }

    // If NOT checked in and Student FOUND -> GRANT ENTRY
    if (student) {
      const entry = {
        regdNo: student.regdNo,
        student: student,
        timestamp: now.toISOString(),
        scannedAt: formattedTime,
        method: method
      };

      this.checkedInMap.set(lookupKey, entry);
      this.saveCheckedInState();

      const result = {
        type: 'SUCCESS',
        student: student,
        regdNo: student.regdNo,
        scannedText: cleanText,
        entry: entry,
        timestamp: now.toISOString(),
        formattedTime: formattedTime
      };

      this.lastResult = result;
      this.notify();
      return result;
    }

    // Student NOT FOUND in Database
    const result = {
      type: 'NOT_FOUND',
      student: null,
      regdNo: candidateRegd,
      scannedText: cleanText,
      timestamp: now.toISOString(),
      formattedTime: formattedTime
    };

    this.lastResult = result;
    this.notify();
    return result;
  }

  manualCheckIn(regdNo) {
    const student = this.studentMap.get(regdNo.toLowerCase());
    if (student) {
      return this.processScan(student.regdNo, 'Manual Check-in');
    }
    return this.processScan(regdNo, 'Manual Check-in');
  }

  undoCheckIn(regdNo) {
    if (!regdNo) return false;
    const cleanKey = String(regdNo).trim().toLowerCase();
    
    // 1. Direct lookup
    if (this.checkedInMap.has(cleanKey)) {
      this.checkedInMap.delete(cleanKey);
      this.saveCheckedInState();
      this.notify();
      return true;
    }

    // 2. Fallback search across checkedInMap keys
    for (const key of this.checkedInMap.keys()) {
      if (key === cleanKey || key.replace(/\D/g, '') === cleanKey.replace(/\D/g, '')) {
        this.checkedInMap.delete(key);
        this.saveCheckedInState();
        this.notify();
        return true;
      }
    }

    return false;
  }

  clearAllCheckIns() {
    this.checkedInMap.clear();
    this.saveCheckedInState();
    this.lastResult = null;
    this.notify();
  }

  isCheckedIn(regdNo) {
    if (!regdNo) return false;
    return this.checkedInMap.has(regdNo.toLowerCase());
  }

  getCheckInDetails(regdNo) {
    if (!regdNo) return null;
    return this.checkedInMap.get(regdNo.toLowerCase()) || null;
  }

  getStats() {
    const total = this.students.length;
    const checkedIn = this.checkedInMap.size;
    const remaining = Math.max(0, total - checkedIn);
    const percentage = total > 0 ? Math.round((checkedIn / total) * 100) : 0;

    return {
      total,
      checkedIn,
      remaining,
      percentage
    };
  }

  exportCSV() {
    const rows = [
      ['Regd No', 'Student Name', 'Email', 'Mobile', 'Education Info', 'Check-in Time', 'Scan Method']
    ];

    this.checkedInMap.forEach(entry => {
      const s = entry.student || {};
      rows.push([
        `"${entry.regdNo || ''}"`,
        `"${s.name || 'Unknown'}"`,
        `"${s.email || ''}"`,
        `"${s.mobile || ''}"`,
        `"${s.campusInfo || ''}"`,
        `"${entry.scannedAt || entry.timestamp || ''}"`,
        `"${entry.method || 'QR Scan'}"`
      ]);
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const store = new Store();
