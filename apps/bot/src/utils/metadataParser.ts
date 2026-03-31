import { logger } from './logger.js';

export interface ArticleMetadata {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  rssUrl: string | null;
}

export async function fetchArticleMetadata(url: string): Promise<ArticleMetadata> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.statusText}`);
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

    // 4. Extract RSS Link
    match = html.match(/<link[^>]+type="application\/rss\+xml"[^>]+href="([^"]+)"/i) ||
            html.match(/<link[^>]+href="([^"]+)"[^>]+type="application\/rss\+xml"/i) ||
            html.match(/<link[^>]+type="application\/atom\+xml"[^>]+href="([^"]+)"/i) ||
            html.match(/<link[^>]+href="([^"]+)"[^>]+type="application\/atom\+xml"/i);
    
    if (match) {
      let rssUrl = match[1];
      if (rssUrl.startsWith('/')) {
        const urlObj = new URL(url);
        rssUrl = `${urlObj.protocol}//${urlObj.host}${rssUrl}`;
      } else if (!rssUrl.startsWith('http')) {
        const urlObj = new URL(url);
        const path = urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
        rssUrl = `${urlObj.protocol}//${urlObj.host}${path}${rssUrl}`;
      }
      metadata.rssUrl = rssUrl;
    }

    return metadata;
  } catch (error) {
    logger.error('Metadata', `Error fetching metadata for ${url}:`, error);
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
