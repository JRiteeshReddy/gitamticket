/**
 * Parses raw CSV string handling quoted fields, commas inside strings, and linebreaks.
 * Auto-detects header row containing 'Regd' or 'Regd no.'.
 */
export function parseCSV(csvText) {
  if (!csvText || typeof csvText !== 'string') return { headers: [], records: [] };

  const lines = [];
  let currentLine = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentLine.push(currentField.trim());
      if (currentLine.some(f => f !== '')) {
        lines.push(currentLine);
      }
      currentLine = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField !== '' || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some(f => f !== '')) {
      lines.push(currentLine);
    }
  }

  if (lines.length === 0) return { headers: [], records: [] };

  // Find header row (the row containing "Regd" or "Regd no.")
  let headerIndex = lines.findIndex(line => 
    line.some(cell => cell.toLowerCase().includes('regd'))
  );

  if (headerIndex === -1) {
    headerIndex = 0; // Fallback to first line if no header matched
  }

  const rawHeaders = lines[headerIndex];
  const headers = rawHeaders.map(h => h.trim());

  // Find index of essential columns
  const regdIndex = headers.findIndex(h => h.toLowerCase().includes('regd'));
  const nameIndex = headers.findIndex(h => h.toLowerCase().includes('name'));
  const emailIndex = headers.findIndex(h => h.toLowerCase().includes('email'));
  const mobileIndex = headers.findIndex(h => h.toLowerCase().includes('mobile'));
  const campusIndex = headers.findIndex(h => h.toLowerCase().includes('education') || h.toLowerCase().includes('campus'));
  const eventIndex = headers.findIndex(h => h.toLowerCase().includes('participation') || h.toLowerCase().includes('event'));
  const statusIndex = headers.findIndex(h => h.toLowerCase() === 'status');

  const records = [];
  const seenRegd = new Set();

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row || row.length === 0) continue;

    let rawRegd = regdIndex !== -1 && row[regdIndex] ? row[regdIndex].trim() : '';
    if (!rawRegd) {
      // Fallback for general CSVs (like Sheet 2 logins or custom lists)
      rawRegd = row[emailIndex !== -1 ? emailIndex : 0] || `ROW_${i}`;
    }

    // Clean regd number (remove whitespace)
    const regdNo = rawRegd.replace(/\s+/g, '');

    // Skip duplicates in CSV if any
    if (seenRegd.has(regdNo)) continue;
    seenRegd.add(regdNo);

    const record = {
      regdNo: regdNo,
      name: (nameIndex !== -1 && row[nameIndex]) ? row[nameIndex].trim() : 'Unknown Name',
      email: (emailIndex !== -1 && row[emailIndex]) ? row[emailIndex].trim() : '',
      mobile: (mobileIndex !== -1 && row[mobileIndex]) ? row[mobileIndex].trim() : '',
      campusInfo: (campusIndex !== -1 && row[campusIndex]) ? row[campusIndex].trim() : '',
      event: (eventIndex !== -1 && row[eventIndex]) ? row[eventIndex].trim() : '',
      status: (statusIndex !== -1 && row[statusIndex]) ? row[statusIndex].trim() : 'Approved',
      rawRow: row
    };

    records.push(record);
  }

  return { headers, records };
}

/**
 * Extracts a candidate Registration Number from raw scanned QR code text.
 * QR codes might be raw "2025737065", a URL "https://.../2025737065", or JSON {"regdNo":"2025737065"}
 */
export function extractRegdNo(scannedText) {
  if (!scannedText) return '';
  const text = scannedText.trim();

  // 1. Try parsing JSON
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.regdNo) return String(parsed.regdNo).trim();
      if (parsed.regd) return String(parsed.regd).trim();
      if (parsed.id) return String(parsed.id).trim();
    } catch (e) {
      // not JSON, continue
    }
  }

  // 2. Try match standard 10-digit numeric ID (e.g. 2025737065 or 2024107512)
  const tenDigitMatch = text.match(/\b\d{10}\b/);
  if (tenDigitMatch) {
    return tenDigitMatch[0];
  }

  // 3. Try any contiguous number sequence of 8-12 digits
  const numMatch = text.match(/\b\d{8,12}\b/);
  if (numMatch) {
    return numMatch[0];
  }

  // 4. Return clean trimmed string
  return text;
}
