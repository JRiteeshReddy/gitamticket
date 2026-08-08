const https = require('https');

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
      
      const headerIdx = lines.findIndex(l => l.toLowerCase().includes('regd'));
      console.log('Header Row Line Number in CSV:', headerIdx + 1);
      console.log('Header Content:', lines[headerIdx]);
      
      const dataLines = lines.slice(headerIdx + 1).filter(l => l.trim().length > 0);
      console.log('Total data rows after header:', dataLines.length);

      const seen = new Set();
      const duplicates = [];
      const blankRegds = [];

      dataLines.forEach((line, i) => {
        const parts = line.split(',');
        // Column D is index 3
        const rawRegd = parts[3] ? parts[3].replace(/["\s]/g, '') : '';
        if (!rawRegd) {
          blankRegds.push({ lineNum: headerIdx + 2 + i, snippet: line.substring(0, 40) });
        } else if (seen.has(rawRegd.toLowerCase())) {
          duplicates.push({ lineNum: headerIdx + 2 + i, regd: rawRegd });
        } else {
          seen.add(rawRegd.toLowerCase());
        }
      });

      console.log('Unique Regd Numbers count:', seen.size);
      console.log('Duplicate Regd Numbers count:', duplicates.length, duplicates);
      console.log('Blank Regd Lines count:', blankRegds.length, blankRegds);
    });
  });
}

fetchFollow('https://docs.google.com/spreadsheets/d/e/2PACX-1vTKcsBYzsbP8O58BtbGOvLb5FcHaRc6jDMXn56p9DrbWPohyPs6Le1zomLNaFXRhzApZ7HZ8lEVm17Y/pub?output=csv');
