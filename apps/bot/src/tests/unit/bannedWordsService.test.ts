/**
 * Tests unitaires pour containsBannedWord (Option C).
 *
 * Vérifie que la détection combinée (token exact + frontières Unicode)
 * élimine les faux positifs signalés tout en continuant à flagguer
 * les vrais mots bannis.
 */

import { describe, it, expect } from 'bun:test';
import { containsBannedWord } from '../../services/bannedWordsService.js';

// ---------------------------------------------------------------------------
// Faux positifs à NE PAS flagguer
// ---------------------------------------------------------------------------

describe('containsBannedWord — faux positifs (ne doit PAS flagguer)', () => {
  it('ne flaggue pas "cacao" à cause de "caca"', () => {
    expect(containsBannedWord('cacao', ['caca'])).toBe(false);
  });

  it('ne flaggue pas "Xavier" à cause de "xav" ou sous-mots similaires', () => {
    expect(containsBannedWord('Xavier', ['xav'])).toBe(false);
  });

  it('ne flaggue pas "assassin" à cause de "ass" (anglais)', () => {
    expect(containsBannedWord('assassin', ['ass'])).toBe(false);
  });

  it('ne flaggue pas "classique" à cause de "lass"', () => {
    expect(containsBannedWord('classique', ['lass'])).toBe(false);
  });

  it('ne flaggue pas "cocasse" à cause de "caca"', () => {
    expect(containsBannedWord('cocasse', ['caca'])).toBe(false);
  });

  it('ne flaggue pas "patapon" à cause de "pat"', () => {
    expect(containsBannedWord('patapon', ['pat'])).toBe(false);
  });

  it('préserve les pseudos avec chiffres en un seul token (r2d2, super2man)', () => {
    // Les chiffres ne sont plus des séparateurs → "r2d2" reste un token entier
    expect(containsBannedWord('r2d2', ['r', 'd'])).toBe(false);
    expect(containsBannedWord('super2man', ['man'])).toBe(false);
  });

  it('ne flag pas les mots bannis courts (< 4 chars) en bord de pseudo via regex', () => {
    // "bi" est court → pas de check regex → seul l'exact token match compte
    // "bidon" → token ["bidon"] ≠ "bi" → pas de match
    expect(containsBannedWord('bidon', ['bi'])).toBe(false);
  });

  it('ne flaggue pas un pseudo vide', () => {
    expect(containsBannedWord('', ['caca'])).toBe(false);
  });

  it('ne flaggue pas un pseudo avec uniquement des espaces', () => {
    expect(containsBannedWord('   ', ['caca'])).toBe(false);
  });

  it('ignore les mots bannis vides ou composés d\'espaces', () => {
    expect(containsBannedWord('caca', ['', '   '])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Vrais positifs — DOIT flagguer
// ---------------------------------------------------------------------------

describe('containsBannedWord — vrais positifs (DOIT flagguer)', () => {
  it('flaggue "caca" seul', () => {
    expect(containsBannedWord('caca', ['caca'])).toBe(true);
  });

  it('flaggue "caca" en début de pseudo multi-mots', () => {
    expect(containsBannedWord('caca lol', ['caca'])).toBe(true);
  });

  it('flaggue "caca" en fin de pseudo multi-mots', () => {
    expect(containsBannedWord('super caca', ['caca'])).toBe(true);
  });

  it('flaggue "caca" séparé par un tiret', () => {
    expect(containsBannedWord('le-caca-lol', ['caca'])).toBe(true);
  });

  it('flaggue "caca" séparé par un underscore', () => {
    expect(containsBannedWord('pseudo_caca', ['caca'])).toBe(true);
  });

  it('flaggue "caca123" via la regex frontière (chiffre = non-lettre)', () => {
    // Les chiffres ne sont plus des séparateurs → token = ["caca123"]
    // Mais "caca" est suivi de "1" (non-lettre) → frontière valide → flaggé via regex
    expect(containsBannedWord('caca123', ['caca'])).toBe(true);
  });

  it('flaggue un pseudo insensible à la casse', () => {
    expect(containsBannedWord('CACA', ['caca'])).toBe(true);
  });

  it('flaggue "caca" collé à un non-lettre (ex: "caca!lol")', () => {
    // "!" n'est pas une lettre → la frontière est respectée
    expect(containsBannedWord('caca!lol', ['caca'])).toBe(true);
  });

  it('flaggue "ass" dans "ass-boy" (séparé par tiret)', () => {
    expect(containsBannedWord('ass-boy', ['ass'])).toBe(true);
  });

  it('flaggue un mot banni parmi plusieurs', () => {
    expect(containsBannedWord('je suis caca', ['sale', 'caca', 'merde'])).toBe(true);
  });

  it('ne flaggue rien si aucun mot banni ne correspond', () => {
    expect(containsBannedWord('pseudo propre', ['caca', 'merde'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Check 3 — substring match pour mots longs (≥ 5 chars)
// ---------------------------------------------------------------------------

describe('containsBannedWord — substring match mots longs (≥ 6c)', () => {
  it('flaggue "connerieman" car "connerie" (8c ≥ 6) est un mot banni long', () => {
    expect(containsBannedWord('connerieman', ['connerie'])).toBe(true);
  });

  it('flaggue "leputaindetruc" car "putain" (6c ≥ 6) est dedans', () => {
    expect(containsBannedWord('leputaindetruc', ['putain'])).toBe(true);
  });

  it('ne flaggue PAS "sonofbitch0139" car "bitch" (5c < 6) est sous le seuil', () => {
    // "bitch" = 5c → pas de substring check. Mais token exact ou regex frontière
    // peuvent toujours le détecter s'il est séparé par un séparateur.
    expect(containsBannedWord('sonofbitch0139', ['bitch'])).toBe(false);
  });

  it('ne flaggue PAS "fichier" à cause de "chier" (5c < 6)', () => {
    expect(containsBannedWord('fichier', ['chier'])).toBe(false);
  });

  it('ne flaggue PAS "supermerdedu" car "merde" (5c < 6) est sous le seuil', () => {
    expect(containsBannedWord('supermerdedu', ['merde'])).toBe(false);
  });

  it('ne flaggue PAS via substring un mot de 4c comme "caca" dans "cacao"', () => {
    expect(containsBannedWord('cacao', ['caca'])).toBe(false);
  });

  it('ne flaggue PAS via substring un mot de 4c comme "caca" dans "cacahuète"', () => {
    expect(containsBannedWord('cacahuète', ['caca'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cas limites
// ---------------------------------------------------------------------------

describe('containsBannedWord — cas limites', () => {
  it('gère les mots bannis avec des caractères accentués', () => {
    expect(containsBannedWord('éléphant', ['éléphant'])).toBe(true);
  });

  it('ne flaggue pas "réélection" à cause de "ré"', () => {
    expect(containsBannedWord('réélection', ['ré'])).toBe(false);
  });

  it('gère une liste de mots bannis vide', () => {
    expect(containsBannedWord('caca', [])).toBe(false);
  });

  it('flaggue un mot banni avec des espaces autour dans la liste', () => {
    expect(containsBannedWord('caca', ['  caca  '])).toBe(true);
  });
});
