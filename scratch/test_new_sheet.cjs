// Follow redirect manually
const https = require('https');
const http = require('http');

function fetchWithRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects === 0) return reject(new Error('Too many redirects'));
        return resolve(fetchWithRedirects(res.headers.location, maxRedirects - 1));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQDXuHhjFIWg1L6uQI8Q3L926DJ9gUbC48jN1olwzA2EtdGGGSipqgh2hHLfYbdI1eHuh6BuFeHKEnF/pub?output=csv';

fetchWithRedirects(url).then(data => {
  console.log('First 500 chars:');
  console.log(JSON.stringify(data.substring(0, 500)));
  console.log('\nLines 0-5:');
  const lines = data.split('\n');
  lines.slice(0, 5).forEach((l, i) => console.log(`Line ${i}: [${l.substring(0,200)}]`));
  console.log('Total lines:', lines.length);
}).catch(e => console.error(e));
