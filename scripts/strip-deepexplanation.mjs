// Strip redundant deepExplanation fields from wordbank data files (~2.4 MB saved)
// Run: node scripts/strip-deepexplanation.mjs
import { readFileSync, writeFileSync } from 'fs';

const files = ['cet4', 'cet6', 'ielts', 'toefl', 'advanced'];
const dataDir = 'src/data/wordbank/data';

for (const name of files) {
  const path = `${dataDir}/${name}.ts`;
  let content = readFileSync(path, 'utf8');

  // Handle escaped quotes within values (e.g. deepExplanation:"deny意为...拒绝一项要求\"。该词...")
  // Match: deepExplanation:" followed by any chars (including \" escaped quotes), ending with "
  content = content.replace(/deepExplanation:"(?:[^"\\]|\\.)*"/g, 'deepExplanation:""');

  // Safety: clean any trailing Chinese text after empty deepExplanation (from partial matches)
  content = content.replace(/deepExplanation:""(?:\s*[^,\}]+)(?=,\s*(?:synonyms|antonyms|wordFamily|register|emotion|topics|hasNoChineseEquivalent|deepExplanation|\}))/g, 'deepExplanation:""');

  writeFileSync(path, content);
  console.log(`${name}: done`);
}
