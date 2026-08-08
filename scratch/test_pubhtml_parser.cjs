const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(res.headers.location));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parsePubHtml(htmlText) {
  const records = [];
  const trMatches = htmlText.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
  
  let headers = [];
  trMatches.forEach((trHtml, idx) => {
    const tdMatches = trHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
    const cellValues = tdMatches.map(td => {
      // Strip HTML tags and clean text
      return td.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').trim();
    });

    if (cellValues.some(v => v !== '')) {
      if (headers.length === 0 && cellValues.some(v => v.toLowerCase().includes('email') || v.toLowerCase().includes('regd') || v.toLowerCase().includes('role'))) {
        headers = cellValues;
      } else {
        records.push({ rawRow: cellValues });
      }
    }
  });

  return { headers, records };
}

async function run() {
  console.time('Fetch PubHTML Sheet2');
  const html = await fetchUrl('https://docs.google.com/spreadsheets/d/e/2PACX-1vTKcsBYzsbP8O58BtbGOvLb5FcHaRc6jDMXn56p9DrbWPohyPs6Le1zomLNaFXRhzApZ7HZ8lEVm17Y/pubhtml/sheet?headers=false&gid=1398953584');
  console.timeEnd('Fetch PubHTML Sheet2');

  const { headers, records } = parsePubHtml(html);
  console.log('Headers:', headers);
  console.log('Sheet 2 Logins parsed instantly:', records.map(r => r.rawRow));
}

run();
