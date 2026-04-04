import { describe, expect, test } from 'bun:test';
import {
  buildNewsEmbed,
  buildYouTubeEmbed,
  categoryEmoji,
  feedStatusEmoji,
  getCategoryTheme,
  truncate,
} from '../../utils/embeds';

describe('embeds utils', () => {
  test('retourne un theme par defaut si categorie inconnue', () => {
    const theme = getCategoryTheme('inconnu');
    expect(theme.label).toBe('Actualités');
  });

  test('construit un embed news coherent', () => {
    const embed = buildNewsEmbed({
      title: 'Titre article',
      url: 'https://example.com/a',
      description: 'Description article',
      feedName: 'Feed Test',
      category: 'Tech FR',
      publishedAt: new Date('2026-04-04T10:00:00.000Z'),
      isValidation: true,
      itemId: 'abc123',
    });

    const json = embed.toJSON();
    expect(json.title).toContain('Titre article');
    expect(json.footer?.text).toContain('ID: abc123');
    expect(json.fields?.length).toBeGreaterThanOrEqual(3);
  });

  test('construit un embed youtube coherent', () => {
    const embed = buildYouTubeEmbed({
      title: 'Video test',
      videoId: 'xyz',
      channelName: 'Kotbo TV',
      publishedAt: new Date('2026-04-04T10:00:00.000Z'),
    });

    const json = embed.toJSON();
    expect(json.url).toBe('https://www.youtube.com/watch?v=xyz');
    expect(json.footer?.text).toContain('Kotbo');
  });

  test('helpers utilitaires', () => {
    expect(truncate('abcdef', 5)).toBe('ab...');
    expect(categoryEmoji('YouTube')).toBe('▶️');
    expect(feedStatusEmoji(true)).toBe('🟢');
    expect(feedStatusEmoji(false)).toBe('🔴');
  });
});
