const fs = require('fs');
const readme = fs.readFileSync('README.md', 'utf8');
const quickstartMatch = readme.match(/### Quickstart: Send your first video post([\s\S]*?)```javascript[\s\S]*?```/);
console.log(quickstartMatch ? quickstartMatch[0] : "Not found");
