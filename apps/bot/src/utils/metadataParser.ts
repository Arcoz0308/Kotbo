import { logger } from './logger.js';
import { fetchExternal } from './http.js';

export interface ArticleMetadata {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  rssUrl: string | null;
}

interface FetchArticleMetadataOptions {
  logErrors?: boolean;
}

export async function fetchArticleMetadata(url: string, options?: FetchArticleMetadataOptions): Promise<ArticleMetadata> {
  const shouldLogErrors = options?.logErrors ?? true;
  try {
    const response = await fetchExternal(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Échec de récupération URL: ${response.status} ${response.statusText}`.trim());
    }

    const html = await response.text();

    const metadata: ArticleMetadata = {
      title: null,
      description: null,
      imageUrl: null,
      rssUrl: null,
    };

    // 1. Extract Title
    let match = html.match(/<meta property="og:title" content="([^"]+)"/i) ||
                html.match(/<meta name="twitter:title" content="([^"]+)"/i) ||
                html.match(/<title>([^<]+)<\/title>/i);
    if (match) metadata.title = decodeHtmlEntities(match[1].trim());

    // 2. Extract Description
    match = html.match(/<meta property="og:description" content="([^"]+)"/i) ||
            html.match(/<meta name="description" content="([^"]+)"/i) ||
            html.match(/<meta name="twitter:description" content="([^"]+)"/i);
    if (match) metadata.description = decodeHtmlEntities(match[1].trim());

    // 3. Extract Image
    match = html.match(/<meta property="og:image" content="([^"]+)"/i) ||
            html.match(/<meta name="twitter:image" content="([^"]+)"/i);
    if (match) metadata.imageUrl = match[1];

    // 4. Extract RSS Feed URL
    match = html.match(/<link[^>]+type="application\/rss\+xml"[^>]+href="([^"]+)"/i) ||
            html.match(/<link[^>]+href="([^"]+)"[^>]+type="application\/rss\+xml"/i);
    if (match) {
      try {
        metadata.rssUrl = new URL(match[1], url).href;
      } catch {
        metadata.rssUrl = match[1];
      }
    }

    return metadata;
  } catch (error) {
    if (shouldLogErrors) {
      logger.error('Metadata', `Erreur lors de la récupération des métadonnées pour ${url}:`, error);
    }
    return { title: null, description: null, imageUrl: null, rssUrl: null };
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
