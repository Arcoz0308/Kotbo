import { readFileSync, writeFileSync } from 'node:fs';

try {
  // Read UTF-16LE file
  const buffer = readFileSync('/mnt/c/Users/Elouan/Documents/GitHub/Kotbo/apps/bot/bot_logs.txt');
  // Convert to UTF-8 string
  const text = buffer.toString('utf16le');
  // Write as UTF-8
  writeFileSync('/mnt/c/Users/Elouan/Documents/GitHub/Kotbo/apps/bot/scratch/bot_logs_utf8.txt', text, 'utf8');
  console.log('Logs successfully converted to UTF-8!');
} catch (err) {
  console.error('Failed to convert logs:', err);
}
