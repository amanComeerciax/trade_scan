const http = require('http');
http.get('http://localhost:3000/api/companies?page=1&limit=5', res => {
  let raw = '';
  res.on('data', c => raw += c);
  res.on('end', () => {
    const json = JSON.parse(raw);
    console.log('Total in Mongo:', json.total);
    console.log('First 3 companies now:');
    json.companies.slice(0, 3).forEach((c, i) => {
      console.log(`${i+1}. ${c.name} | 👤 ${c.contactName || 'None'} | 📞 ${c.phone || 'None'} | HS: ${c.products.map(p => p.hsCode).join(', ')}`);
    });
  });
});
