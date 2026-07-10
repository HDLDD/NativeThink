// Minimal wrapper - reads key from file, calls expand script
const fs = require('fs');
const path = require('path');
const key = fs.readFileSync(path.join(__dirname, '.apikey'), 'utf-8').trim();
process.argv.push(key);
require('./expand-corpus.cjs');
