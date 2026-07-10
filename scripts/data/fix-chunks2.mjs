import { readFileSync, writeFileSync } from 'fs';
const file = 'C:/Users/31037/Downloads/app_179qzngz00w/src/data/chunks.ts';
let content = readFileSync(file, 'utf8');
// Replace double-backslash-quote with single-backslash-quote (proper escape)
// In the file: \'  → should be: \'
content = content.replace(/\\'/g, "\'");
writeFileSync(file, content);
// Verify
const l10 = content.split('\n')[9];
console.log('Line 10:', l10.substring(0, 150));
console.log('Count of remaining \\\':', (content.match(/\\'/g) || []).length);
