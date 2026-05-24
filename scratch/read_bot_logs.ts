import * as fs from 'fs';

try {
  const content = fs.readFileSync('apps/bot/bot_logs.txt', 'utf16le');
  const lines = content.split('\n');
  console.log(`Total lines: ${lines.length}`);
  const lastLines = lines.slice(-50);
  console.log('--- Last 50 lines of bot logs ---');
  console.log(lastLines.join('\n'));
} catch (e) {
  console.error('Error reading logs:', e);
}
