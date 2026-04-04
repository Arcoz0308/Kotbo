import { logger } from './logger.js';

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
    const response = await fetch(url, {
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

    const discoveredFeedLinks = extractFeedLinks(html, url);
    if (discoveredFeedLinks.length > 0) {
      metadata.rssUrl = discoveredFeedLinks[0];
    }

    return metadata;
  } catch (error) {
    if (shouldLogErrors) {
      logger.error('Metadata', `Erreur lors de la récupération des métadonnées pour ${url}:`, error);
    }
    return { title: null, description: null, imageUrl: null, rssUrl: null };
  }
}

function extractFeedLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];

  for (const tag of linkTags) {
    const attrs = parseTagAttributes(tag);
    const rel = (attrs.rel ?? '').toLowerCase();
    const type = (attrs.type ?? '').toLowerCase();
    const href = attrs.href;

    if (!href) continue;

    const looksLikeFeedType =
      type.includes('application/rss+xml') ||
      type.includes('application/atom+xml') ||
      type.includes('application/rdf+xml') ||
      type.includes('text/xml') ||
      type.includes('application/xml');

    const looksLikeFeedHref = /rss|atom|feed|xml/i.test(href);
    const isAlternate = rel.split(/\s+/).includes('alternate');

    if (!looksLikeFeedType && !(isAlternate && looksLikeFeedHref)) continue;

    try {
      const resolved = new URL(href, baseUrl).toString();
      if (!seen.has(resolved)) {
        seen.add(resolved);
        links.push(resolved);
      }
    } catch {
      continue;
    }
  }

  return links;
}

function parseTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attrRegex.exec(tag)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[3] ?? match[4] ?? match[5] ?? '';
    attrs[key] = value;
  }

  return attrs;
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
