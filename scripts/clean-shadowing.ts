/**
 * Clean shadowing.ts: remove pad-N sentences from all materials
 * and create a new separate material with them.
 */
import * as fs from 'fs';
import * as path from 'path';

const SHADOWING_FILE = path.resolve(import.meta.dirname, '../src/data/shadowing.ts');

// Read the file
let content = fs.readFileSync(SHADOWING_FILE, 'utf-8');

// Find the pad sentence definitions (from the first occurrence)
const padSentences: string[] = [];
const padRegex = /^\s*S\("(pad-\d+)","([^"]*)","([^"]*)","([^"]*)",(\d+)\),?\s*$/gm;
let match: RegExpExecArray | null;

// Collect all unique pad sentences from first material
const firstMaterialStart = content.indexOf("S(\"pad-1\"");
const firstMaterialEnd = content.indexOf("]}," , firstMaterialStart);
const firstPadBlock = content.slice(firstMaterialStart, firstMaterialEnd);

const padLines = firstPadBlock.split('\n').filter(l => l.includes('S("pad-'));
for (const line of padLines) {
  padSentences.push(line.trim().replace(/^(\s*)S\(/, '      S(').replace(/,\s*$/, ''));
}

console.log(`Found ${padSentences.length} unique pad sentences.`);

// Remove ALL pad-N lines from ALL materials
// Pattern: lines that contain S("pad-N" where N is 1-99
const padLineRegex = /^\s*S\("pad-\d+".*\n/gm;
const before = content.length;
content = content.replace(padLineRegex, '');
const after = content.length;
console.log(`Removed pad lines: ${before - after} bytes (${(before - after) / before * 100 | 0}% reduction)`);

// Check if there were any leftover empty lines (a pad line with a trailing newline)
// Fix double-newlines that might have been created
content = content.replace(/\n\n\n/g, '\n\n');

// Build the new standalone pad practice material
const padMaterialSentences = padSentences.map((s, i) => {
  // Add comma at end except for last
  return i < padSentences.length - 1 ? s + ',' : s;
}).join('\n');

const newMaterial = `
  // ===== PAD PRACTICE (1 material) =====
  { id:'117',title:'跟读基础训练',category:'daily',difficulty:'beginner',accent:'US',totalDuration:50,description:'影子跟读基础训练句子合集',
    sentences:[
${padMaterialSentences}
    ]},

];`;

// Insert the new material before the closing `];`
content = content.replace(/\n\];\s*$/, newMaterial);

// Write back
fs.writeFileSync(SHADOWING_FILE, content, 'utf-8');
console.log(`✓ Written updated shadowing.ts (${content.length} bytes)`);

// Verify
const verify = fs.readFileSync(SHADOWING_FILE, 'utf-8');
const remainingPads = (verify.match(/S\("pad-/g) || []).length;
const pad1Count = (verify.match(/S\("pad-1"/g) || []).length;
console.log(`\nVerification:`);
console.log(`  Total pad sentences remaining: ${remainingPads}`);
console.log(`  pad-1 occurrences: ${pad1Count}`);
console.log(`  Expected: 15 pad sentences (all in material 117 only)`);

if (pad1Count === 1 && remainingPads === 15) {
  console.log(`\n✓ SUCCESS: All duplicates removed, pad sentences now in standalone material.`);
} else {
  console.log(`\n⚠ WARNING: Unexpected counts. Please check the file manually.`);
}
