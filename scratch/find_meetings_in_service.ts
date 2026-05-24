import * as fs from 'fs';

const content = fs.readFileSync('apps/bot/src/services/staffLeadershipService.ts', 'utf8');
const lines = content.split('\n');

function findTerm(term: string) {
  console.log(`--- Searching for ${term} ---`);
  lines.forEach((line, index) => {
    if (line.includes(term)) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  });
}

findTerm('getMeetings');
findTerm('createMeeting');
findTerm('updateMeeting');
findTerm('deleteMeeting');
