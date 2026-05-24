import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const indexPath = path.join(distDir, 'index.html');

const routes = [
  'dashboard',
  'network',
  'network/config',
  'network/dial',
  'diagnostics',
  'system',
  'system/modem-setting',
  'sms',
  'sms/sms',
  'sms/setting',
  'atdebug',
];

if (!fs.existsSync(indexPath)) {
  throw new Error(`Missing build entry: ${indexPath}`);
}

const indexHtml = fs.readFileSync(indexPath);

for (const route of routes) {
  const routeDir = path.join(distDir, route);
  fs.mkdirSync(routeDir, { recursive: true });
  fs.writeFileSync(path.join(routeDir, 'index.html'), indexHtml);
}
