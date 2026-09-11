const fs = require('fs');
const path = require('path');
const sdk = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk').replace(/\\/g, '/');
fs.writeFileSync('android/local.properties', 'sdk.dir=' + sdk + '\n');
console.log('local.properties:', fs.readFileSync('android/local.properties', 'utf8').trim());

let g = fs.readFileSync('android/gradle.properties', 'utf8');
if (!g.includes('org.gradle.java.home')) {
  g += '\norg.gradle.java.home=B:/jdk21\norg.gradle.jvmargs=-Xmx2560m\n';
  fs.writeFileSync('android/gradle.properties', g);
}
console.log('gradle jdk:', (fs.readFileSync('android/gradle.properties', 'utf8').match(/org\.gradle\.java\.home=.+/) || ['?'])[0]);
