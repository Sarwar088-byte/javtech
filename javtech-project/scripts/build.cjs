const fs = require('node:fs');
fs.mkdirSync('dist', { recursive: true });
for (const file of ['index.html', 'about.html', 'services.html', 'contact.html', 'css', 'js']) {
  fs.cpSync(file, `dist/${file}`, { recursive: true });
}
