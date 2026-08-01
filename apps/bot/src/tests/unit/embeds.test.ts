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
    expect(json.fields?.length).toBeGreaterThanOrEqual(2);
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
    expect(json.footer?.text).toBe('YouTube');
    expect(json.description).toBe('Kotbo TV a publié une vidéo sur YouTube !');
  });

  test('embed youtube : avatar, miniature et extrait de description', () => {
    const embed = buildYouTubeEmbed({
      title: 'Video test',
      videoId: 'xyz',
      channelName: 'Kotbo TV',
      publishedAt: new Date('2026-04-04T10:00:00.000Z'),
      description: 'Un resume de la video.',
      channelUrl: 'https://www.youtube.com/channel/UC123',
      channelAvatarUrl: 'https://yt3.googleusercontent.com/avatar.jpg',
      thumbnailUrl: 'https://i.ytimg.com/vi/xyz/maxresdefault.jpg',
    });

    const json = embed.toJSON();
    expect(json.author?.url).toBe('https://www.youtube.com/channel/UC123');
    expect(json.author?.icon_url).toBe('https://yt3.googleusercontent.com/avatar.jpg');
    expect(json.thumbnail?.url).toBe('https://yt3.googleusercontent.com/avatar.jpg');
    expect(json.image?.url).toBe('https://i.ytimg.com/vi/xyz/maxresdefault.jpg');
    expect(json.description).toContain('**Description**');
    expect(json.description).toContain('Un resume de la video.');
  });

  test('embed youtube : accroche adaptee au type d annonce', () => {
    const base = {
      title: 'Video test',
      videoId: 'xyz',
      channelName: 'Kotbo TV',
      publishedAt: new Date('2026-04-04T10:00:00.000Z'),
    };

    expect(buildYouTubeEmbed({ ...base, kind: 'live' }).toJSON().description)
      .toBe('Kotbo TV est en direct sur YouTube !');
    expect(buildYouTubeEmbed({ ...base, kind: 'short' }).toJSON().description)
      .toBe('Kotbo TV a publié un Short sur YouTube !');
  });

  test('helpers utilitaires', () => {
    expect(truncate('abcdef', 5)).toBe('ab...');
    expect(categoryEmoji('YouTube')).toBe('<:ktb_yt:1519265317665247232>');
    expect(feedStatusEmoji(true)).toBe('<:ktb_online:1519265298698600579>');
    expect(feedStatusEmoji(false)).toBe('<:ktb_offline:1519265296748253245>');
  });
});
