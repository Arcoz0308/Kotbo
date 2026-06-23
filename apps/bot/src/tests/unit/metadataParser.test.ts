import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { fetchArticleMetadata } from '../../utils/metadataParser';

describe('fetchArticleMetadata', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock() as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('extrait title, description, image et flux rss', async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Titre Test &amp; Démo" />
          <meta property="og:description" content="Description &quot;propre&quot;" />
          <meta property="og:image" content="https://example.com/image.png" />
          <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
        </head>
      </html>
    `;

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    fetchMock.mockResolvedValue({
      ok: true,
      statusText: 'OK',
      text: async () => html,
    });

    const data = await fetchArticleMetadata('https://example.com/post');

    expect(data.title).toBe('Titre Test & Démo');
    expect(data.description).toBe('Description "propre"');
    expect(data.imageUrl).toBe('https://example.com/image.png');
    expect(data.rssUrl).toBe('https://example.com/feed.xml');
  });

  test("retourne des valeurs nulles en cas d\'erreur reseau", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof mock>;
    fetchMock.mockRejectedValue(new Error('network error'));

    const data = await fetchArticleMetadata('https://example.com/fail');

    expect(data).toEqual({
      title: null,
      description: null,
      imageUrl: null,
      rssUrl: null,
    });
  });
});
