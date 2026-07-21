import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';
import { translateFile } from './translate-compiler';

// Check if file contains French accents or common French UI words
function fileNeedsTranslation(filePath: string): boolean {
  const content = readFileSync(filePath, 'utf-8');
  // Simple check for French accents or common single words/patterns
  const hasAccents = /[éèàçùâêîôûëïüöäÿœæ]/i.test(content);
  const hasFrenchWords = /\b(le|la|les|de|des|du|un|une|et|en|est|sont|pour|dans|par|sur|avec|sans|sous|dans|qui|que|quoi|dont|où|ce|cet|cette|ces|motif|décision|refuser|approuver|confirmer|enregistrer|supprimer|modifier|ajouter|annuler|valider)\b/i.test(content);
  return hasAccents || hasFrenchWords;
}

function getFilesRecursively(dir: string, extension: string): string[] {
  let results: string[] = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath, extension));
    } else if (filePath.endsWith(extension)) {
      results.push(filePath);
    }
  }
  return results;
}

async function main() {
  console.log("Scanning workspace for files needing translation...");
  
  const dashboardPages = getFilesRecursively('apps/dashboard/src/pages', '.svelte');
  const botCommands = getFilesRecursively('apps/bot/src/commands', '.ts');
  
  const allFiles = [...dashboardPages, ...botCommands];
  console.log(`Found ${dashboardPages.length} dashboard Svelte pages and ${botCommands.length} bot TS commands.`);
  
  const filesToTranslate = allFiles.filter(file => {
    // Exclude index files or config files if not containing code
    if (file.endsWith('index.ts') || file.endsWith('commands.ts')) return false;
    return fileNeedsTranslation(file);
  });
  
  console.log(`Identified ${filesToTranslate.length} files that need translation.`);
  
  // We can process files one by one to avoid rate limits
  for (let i = 0; i < filesToTranslate.length; i++) {
    const file = filesToTranslate[i];
    console.log(`\n[${i + 1}/${filesToTranslate.length}] Processing ${file}...`);
    try {
      await translateFile(file);
      // Wait 1 second between files to be gentle to the Google Translate API
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error(`Error processing ${file}:`, e);
    }
  }
  
  console.log("\nFinished translation of all workspace files!");
}

main().catch(err => console.error(err));
