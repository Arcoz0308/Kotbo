export type MarkdownSegment =
  | { type: 'text'; value: string }
  | { type: 'bold' | 'italic' | 'underline' | 'strike'; value: string }
  | { type: 'code'; value: string }
  | { type: 'codeblock'; value: string; lang?: string }
  | { type: 'emoji'; url: string; alt: string }
  | { type: 'link'; url: string; label: string };

const TOKEN_RE = /```(\w*)\n?([\s\S]*?)```|`([^`\n]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|__([^_]+)__|~~([^~]+)~~|<(a?):([a-zA-Z0-9_]+):(\d+)>|(https?:\/\/[^\s<]+)/g;

export function tokenizeDiscordMarkdown(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TOKEN_RE.lastIndex = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    const [, codeLang, codeBody, inlineCode, bold, italic, underline, strike, emojiAnimated, emojiName, emojiId, url] = match;

    if (codeBody !== undefined) {
      segments.push({ type: 'codeblock', value: codeBody, lang: codeLang || undefined });
    } else if (inlineCode !== undefined) {
      segments.push({ type: 'code', value: inlineCode });
    } else if (bold !== undefined) {
      segments.push({ type: 'bold', value: bold });
    } else if (italic !== undefined) {
      segments.push({ type: 'italic', value: italic });
    } else if (underline !== undefined) {
      segments.push({ type: 'underline', value: underline });
    } else if (strike !== undefined) {
      segments.push({ type: 'strike', value: strike });
    } else if (emojiId !== undefined) {
      const ext = emojiAnimated === 'a' ? 'gif' : 'png';
      segments.push({ type: 'emoji', url: `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`, alt: `:${emojiName}:` });
    } else if (url !== undefined) {
      segments.push({ type: 'link', url, label: url });
    }

    lastIndex = TOKEN_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}
