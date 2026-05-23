import * as fs from 'fs';

const content = fs.readFileSync('apps/bot/src/api/dashboardApi.ts', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('auditUser')) {
    console.log(`Line ${index + 1}: ${line.trim()}`);
  }
});
