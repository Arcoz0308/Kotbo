import { describe, expect, test } from 'bun:test';
import {
  renderFollowTemplate,
  resolveFollowMessage,
  templateHasVariable,
} from '../../services/integrations/socialTemplates';

describe('socialTemplates', () => {
  test('remplace la syntaxe crochets documentee par le dashboard', () => {
    const result = renderFollowTemplate('🔴 [channel] est en direct : [title]', {
      channel: 'Kotbo',
      title: 'Refonte du bot',
    });

    expect(result).toBe('🔴 Kotbo est en direct : Refonte du bot');
  });

  test('accepte aussi la syntaxe accolades historique', () => {
    const result = renderFollowTemplate('{channel} : {title}', { channel: 'Kotbo', title: 'Live' });
    expect(result).toBe('Kotbo : Live');
  });

  test('remplace toutes les occurrences, pas seulement la premiere', () => {
    const result = renderFollowTemplate('[channel] [channel] [channel]', { channel: 'A' });
    expect(result).toBe('A A A');
  });

  test('gere les variables jeu, spectateurs et url', () => {
    const result = renderFollowTemplate('[game] · [viewers] · [url]', {
      game: 'Minecraft',
      viewers: 1234,
      url: 'https://twitch.tv/kotbo',
    });

    expect(result).toBe('Minecraft · 1234 · https://twitch.tv/kotbo');
  });

  test('efface une variable absente au lieu de laisser le placeholder', () => {
    expect(renderFollowTemplate('Jeu: [game]', { game: null })).toBe('Jeu: ');
  });

  test('laisse intacts les placeholders inconnus', () => {
    expect(renderFollowTemplate('[inconnu] [title]', { title: 'X' })).toBe('[inconnu] X');
  });

  test('templateHasVariable detecte les deux syntaxes et ignore les autres', () => {
    expect(templateHasVariable('a [title] b', 'title')).toBe(true);
    expect(templateHasVariable('a {title} b', 'title')).toBe(true);
    expect(templateHasVariable('a [channel] b', 'title')).toBe(false);
    expect(templateHasVariable(null, 'title')).toBe(false);
  });

  test('resolveFollowMessage retombe sur le defaut si le modele est vide', () => {
    expect(resolveFollowMessage(null, 'defaut', {})).toBe('defaut');
    expect(resolveFollowMessage('   ', 'defaut', {})).toBe('defaut');
  });

  test('resolveFollowMessage retombe sur le defaut si le rendu devient vide', () => {
    // Un modele reduit a une variable non fournie ne doit pas produire un message vide.
    expect(resolveFollowMessage('[title]', 'defaut', { title: '' })).toBe('defaut');
  });

  test('resolveFollowMessage utilise le modele quand il produit du texte', () => {
    expect(resolveFollowMessage('Live de [channel]', 'defaut', { channel: 'Kotbo' })).toBe('Live de Kotbo');
  });
});
