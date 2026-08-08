const https = require('https');
const { parseCSV } = require('../src/csvParser.js');

function fetchFollow(url) {
  https.get(url, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      fetchFollow(res.headers.location);
      return;
    }
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      const lines = data.split('\n');
      console.log('Total raw CSV lines in Sheet 1 file:', lines.length);
      
      const { headers, records } = parseCSV(data);
      console.log('Headers detected:', headers);
      console.log('Total Parsed Records:', records.length);
      
      // Let's count header row index
      const headerIdx = lines.findIndex(l => l.toLowerCase().includes('regd'));
      console.log('Header Row Line Number in CSV:', headerIdx + 1);
      
      const dataLines = lines.slice(headerIdx + 1).filter(l => l.trim().length > 0);
      console.log('Total non-empty data rows after header:', dataLines.length);

      // Check duplicates or blank regd numbers
      const seen = new Set();
      const duplicates = [];
      const blankRegds = [];

      dataLines.forEach((line, i) => {
        const parts = line.split(',');
        // Find regd column (usually column D = index 3)
        const rawRegd = parts[3] ? parts[3].replace(/["\s]/g, '') : '';
        if (!rawRegd) {
          blankRegds.push({ lineNum: headerIdx + 2 + i, line });
        } else if (seen.has(rawRegd.toLowerCase())) {
          duplicates.push({ lineNum: headerIdx + 2 + i, regd: rawRegd });
        } else {
          seen.add(rawRegd.toLowerCase());
        }
      });

      console.log('Duplicate Regd Numbers in Sheet 1:', duplicates.length, duplicates.slice(0, 5));
      console.log('Blank Regd Lines in Sheet 1:', blankRegds.length, blankRegds.slice(0, 5));
    });
  });
}

fetchFollow('https://docs.google.com/spreadsheets/d/e/2PACX-1vTKcsBYzsbP8O58BtbGOvLb5FcHaRc6jDMXn56p9DrbWPohyPs6Le1zomLNaFXRhzApZ7HZ8lEVm17Y/pub?output=csv');
