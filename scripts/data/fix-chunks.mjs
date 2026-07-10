import { readFileSync, writeFileSync } from 'fs';

const filePath = process.argv[2];
let content = readFileSync(filePath, 'utf8');

// Remove trailing ' from every line
content = content.split('\n').map(line => {
  return line.replace(/'\r?$/, '');
}).join('\n');

// Normalize: replace \' with just ' inside strings
// This is safe because TypeScript handles the escape
content = content.replace(/\'/g, "'");

console.log('Fixed file:', filePath);
console.log('Length:', content.length);
writeFileSync(filePath, content, 'utf8');
