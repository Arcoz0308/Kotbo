import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';

const GOOGLE_TRANSLATE_LIMIT = 50; // Max translations per file to avoid rate limits

async function translateToEnglish(text: string): Promise<string> {
  const cleanText = text.trim().replace(/\s+/g, ' ');
  if (!cleanText) return '';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=fr&tl=en&dt=t&q=${encodeURIComponent(cleanText)}`;
    const res = await fetch(url);
    if (!res.ok) return cleanText;
    const json = await res.json() as any;
    return json[0][0][0] || cleanText;
  } catch (e) {
    console.error(`Translation error for "${cleanText}":`, e);
    return cleanText;
  }
}

// Check if string looks like French user-facing text
function isFrenchText(text: string): boolean {
  const clean = text.trim();
  if (clean.length < 2) return false;
  if (/^[a-zA-Z0-9_\-\/]+$/.test(clean) && !/[éèàçùâêîôûëïüöäÿœæ]/i.test(clean)) {
    // Single word/key with no accents
    // Whitelist of common French UI words that are single words
    const uiWords = /^(supprimer|modifier|ajouter|annuler|valider|enregistrer|confirmer|refuser|approuver|quitter|fermer|ouvrir|sauvegarder|rechercher|motif|note|statut|aide|ping|historique|détails|actif|inactif|oui|non|tous|aucun|équipe|réunions|absences|membres|paramètres|accueil)$/i;
    if (!uiWords.test(clean)) {
      return false;
    }
  }
  
  if (/^[0-9:\-\s]+$/.test(clean)) return false; // Dates/numbers
  if (/^#?[0-9a-fA-F]{3,8}$/.test(clean)) return false; // Hex colors
  if (clean.startsWith('http://') || clean.startsWith('https://')) return false;
  if (clean.startsWith('M') && /[0-9\s,\.\-LzZ]+/.test(clean)) return false; // SVG path
  
  // Ignore CSS/Tailwind classes
  const cssPattern = /\b(flex|grid|block|inline|hidden|col|row|bg|text|border|rounded|shadow|gap|top|bottom|left|right|opacity|duration|ease|animate|transition|hover|focus|dark|active|cursor|overflow|items|justify|align|absolute|relative|fixed|custom-scrollbar)\b/i;
  if (cssPattern.test(clean) && !/[éèàçùâêîôûëïüöäÿœæ]/i.test(clean) && !/\b(le|la|les|de|des|du|un|une|et|en|est|sont|pour|dans|par|sur|avec|sans|sous|dans|qui|que|quoi|dont|où|ce|cet|cette|ces)\b/i.test(clean)) {
    return false;
  }

  // Contains French accents or common French words
  const hasAccents = /[éèàçùâêîôûëïüöäÿœæ]/.test(clean.toLowerCase());
  const frenchWords = /\b(le|la|les|de|des|du|un|une|et|en|est|sont|pour|dans|par|sur|avec|sans|sous|dans|qui|que|quoi|dont|où|ce|cet|cette|ces|mon|ton|son|ma|ta|sa|mes|tes|ses|nous|vous|ils|elles|leur|leurs|notre|votre|nos|vos|tous|tout|toute|toutes|aux|au|se|y|ne|pas|plus|jamais|rien|aucun|quel|quels|quelle|quelles|votre|notre|vignette|absence|absences|réunion|réunions|supprimer|modifier|ajouter|annuler|valider|enregistrer|charger|chargement|erreur|statut|serveur|serveurs|membres|paramètres|motif|décision|refuser|approuver|confirmer|note)\b/i;
  const hasFrenchWords = frenchWords.test(clean);

  return hasAccents || hasFrenchWords;
}

function getPrefix(filePath: string): string {
  const name = basename(filePath, filePath.endsWith('.svelte') ? '.svelte' : '.ts').toLowerCase();
  if (name.length <= 3) return name;
  const consonants = name.replace(/[aeiou]/g, '');
  if (consonants.length >= 2) return consonants.slice(0, 3);
  return name.slice(0, 3);
}

function cleanSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 30);
}

export async function translateFile(filePath: string) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    console.error(`File does not exist: ${filePath}`);
    return;
  }

  console.log(`\nTranslating: ${filePath}`);
  const originalContent = readFileSync(absolutePath, 'utf-8');
  let content = originalContent;
  const isSvelte = filePath.endsWith('.svelte');
  const isBot = filePath.includes('apps/bot') || filePath.includes('packages/');
  
  const prefix = getPrefix(filePath);
  
  const messagesDir = isBot ? 'apps/bot/messages' : 'apps/dashboard/messages';
  const frPath = resolve(messagesDir, 'fr.json');
  const enPath = resolve(messagesDir, 'en.json');
  
  const frDict = existsSync(frPath) ? JSON.parse(readFileSync(frPath, 'utf-8')) : { "$schema": "https://inlang.com/schema/inlang-message-format" };
  const enDict = existsSync(enPath) ? JSON.parse(readFileSync(enPath, 'utf-8')) : { "$schema": "https://inlang.com/schema/inlang-message-format" };

  const replacements: Array<{ original: string; key: string; isHtml: boolean; isAttr: boolean; attrName?: string }> = [];
  let translationCount = 0;

  const lines = content.split(/\r?\n/);
  let inScript = !isSvelte;
  let inStyle = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isSvelte) {
      if (line.includes('<script')) {
        inScript = true;
        continue;
      }
      if (line.includes('</script>')) {
        inScript = false;
        continue;
      }
      if (line.includes('<style')) {
        inStyle = true;
        continue;
      }
      if (line.includes('</style>')) {
        inStyle = false;
        continue;
      }
    }

    if (inStyle) continue;

    // 1. If we are in template (HTML), search for HTML text and attributes
    if (isSvelte && !inScript) {
      // HTML text node on this single line
      const htmlTextRegex = />([^<{}]+)</g;
      let match;
      while ((match = htmlTextRegex.exec(line)) !== null) {
        const text = match[1].trim();
        if (isFrenchText(text) && !replacements.some(r => r.original === text)) {
          if (translationCount++ >= GOOGLE_TRANSLATE_LIMIT) break;
          const enVal = await translateToEnglish(text);
          const key = `${prefix}_${cleanSlug(enVal)}`;
          replacements.push({ original: text, key, isHtml: true, isAttr: false });
          frDict[key] = text;
          enDict[key] = enVal;
        }
      }

      // Attributes on this single line
      const attrRegex = /\b(placeholder|label|title|description)="([^"{}]+)"/g;
      while ((match = attrRegex.exec(line)) !== null) {
        const attrName = match[1];
        const text = match[2].trim();
        if (isFrenchText(text) && !replacements.some(r => r.original === text)) {
          if (translationCount++ >= GOOGLE_TRANSLATE_LIMIT) break;
          const enVal = await translateToEnglish(text);
          const key = `${prefix}_${cleanSlug(enVal)}`;
          replacements.push({ original: text, key, isHtml: false, isAttr: true, attrName });
          frDict[key] = text;
          enDict[key] = enVal;
        }
      }
      const attrRegexSingle = /\b(placeholder|label|title|description)='([^'{}]+)'/g;
      while ((match = attrRegexSingle.exec(line)) !== null) {
        const attrName = match[1];
        const text = match[2].trim();
        if (isFrenchText(text) && !replacements.some(r => r.original === text)) {
          if (translationCount++ >= GOOGLE_TRANSLATE_LIMIT) break;
          const enVal = await translateToEnglish(text);
          const key = `${prefix}_${cleanSlug(enVal)}`;
          replacements.push({ original: text, key, isHtml: false, isAttr: true, attrName });
          frDict[key] = text;
          enDict[key] = enVal;
        }
      }
    }

    // 2. If we are in script (JS/TS), search for string literals
    if (inScript) {
      if (line.trim().startsWith('import ') || line.trim().startsWith('export {') || line.includes('console.') || line.includes('logger.') || line.includes('prisma.')) {
        continue;
      }
      // Standard string literal regex that supports escaped quotes
      const stringRegex = /(['"`])((?:[^\\]|\\.)*?)\1/g;
      let match;
      while ((match = stringRegex.exec(line)) !== null) {
        const text = match[2].replace(/\\'/g, "'").replace(/\\"/g, '"').trim();
        if (text.length >= 3 && text.length <= 100 && isFrenchText(text) && !replacements.some(r => r.original === text)) {
          if (translationCount++ >= GOOGLE_TRANSLATE_LIMIT) break;
          const enVal = await translateToEnglish(text);
          const key = `${prefix}_${cleanSlug(enVal)}`;
          // Store the original literal content (escaped) for replacement match
          replacements.push({ original: match[2], key, isHtml: false, isAttr: false });
          frDict[key] = text;
          enDict[key] = enVal;
        }
      }
    }
  }

  if (replacements.length === 0) {
    console.log(`No French strings found or already localized.`);
    return;
  }

  console.log(`Found ${replacements.length} translations:`);
  for (const r of replacements) {
    console.log(`  - "${r.original}" -> key: "${r.key}" (${enDict[r.key]})`);
  }

  // Rewrite content
  const sortedReplacements = [...replacements].sort((a, b) => b.original.length - a.original.length);
  
  for (const r of sortedReplacements) {
    if (r.isHtml) {
      const escapedOriginal = r.original.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`>(\\s*)${escapedOriginal}(\\s*)<`, 'g');
      content = content.replace(regex, `>$1{m.${r.key}()}$2<`);
    } else if (r.isAttr) {
      const escapedOriginal = r.original.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regexDouble = new RegExp(`\\b${r.attrName}="${escapedOriginal}"`, 'g');
      content = content.replace(regexDouble, `${r.attrName}={m.${r.key}()}`);
      const regexSingle = new RegExp(`\\b${r.attrName}='${escapedOriginal}'`, 'g');
      content = content.replace(regexSingle, `${r.attrName}={m.${r.key}()}`);
    } else {
      const escapedOriginal = r.original.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regexDouble = new RegExp(`"${escapedOriginal}"`, 'g');
      content = content.replace(regexDouble, `m.${r.key}()`);
      const regexSingle = new RegExp(`'${escapedOriginal}'`, 'g');
      content = content.replace(regexSingle, `m.${r.key}()`);
      const regexBacktick = new RegExp(`\`${escapedOriginal}\` `, 'g');
      content = content.replace(regexBacktick, `m.${r.key}()`);
    }
  }

  // Inject Paraglide import if not present
  if (isSvelte) {
    if (!content.includes('import { m } from')) {
      if (content.includes('<script lang="ts">')) {
        content = content.replace('<script lang="ts">', `<script lang="ts">\n  import { m } from '${isBot ? '../lib/paraglide' : '../lib/i18n'}';`);
      } else if (content.includes('<script>')) {
        content = content.replace('<script>', `<script>\n  import { m } from '${isBot ? '../lib/paraglide' : '../lib/i18n'}';`);
      } else {
        content = `<script lang="ts">\n  import { m } from '${isBot ? '../lib/paraglide' : '../lib/i18n'}';\n</script>\n\n` + content;
      }
    }
  } else {
    if (!content.includes('import * as m from') && !content.includes('import { m }')) {
      content = `import * as m from '${isBot ? '../../lib/paraglide/messages.js' : '../lib/i18n'}';\n` + content;
    }
  }

  // Save changes
  writeFileSync(absolutePath, content, 'utf-8');
  writeFileSync(frPath, JSON.stringify(frDict, null, 2), 'utf-8');
  writeFileSync(enPath, JSON.stringify(enDict, null, 2), 'utf-8');
  console.log(`Saved changes to source file and message dictionaries.`);
}

if (require.main === module) {
  const file = process.argv[2];
  if (file) {
    translateFile(file).catch(err => console.error(err));
  } else {
    console.log("Usage: bun scripts/translate-compiler.ts <file-path>");
  }
}
