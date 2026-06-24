// ─────────────────────────────────────────────────────────────
// Kotbo Discord Emoji & Markdown Parser
// ─────────────────────────────────────────────────────────────

/**
 * Escapes standard HTML special characters for safety.
 */
export function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Parses Discord custom emojis (including <:ktb_...:id>) and standard Discord Markdown.
 * Returns an HTML string that can be safely rendered using {@html}.
 */
export function parseDiscordEmojisAndMarkdown(text: string | null | undefined): string {
  if (!text) return '';

  // 1. Escape HTML for safety first
  let html = escapeHtml(text);

  // 2. Parse custom emojis (format: &lt;a?:name:id&gt;)
  // Matches: &lt;:name:id&gt; or &lt;a:name:id&gt;
  // This loads the real, official emojis from Discord CDN for professional rendering.
  html = html.replace(/&lt;a?:(\w+):(\d+)&gt;/g, (match, name, id) => {
    const isAnimated = match.startsWith('&lt;a:');
    const ext = isAnimated ? 'gif' : 'webp';
    return `<img src="https://cdn.discordapp.com/emojis/${id}.${ext}?size=48&quality=lossless" alt=":${name}:" title=":${name}:" class="inline-block h-[1.25em] w-[1.25em] mx-0.5 align-middle" style="vertical-align: -0.2em;" />`;
  });

  // 3. Parse Discord Markdown
  html = html
    // Strikethrough: ~~text~~
    .replace(/~~(.*?)~~/g, '<del class="line-through opacity-70">$1</del>')
    // Bold: **text**
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
    // Italic: *text* or _text_
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    .replace(/_(.*?)_/g, '<em class="italic">$1</em>')
    // Underline: __text__
    .replace(/__(.*?)__/g, '<u class="underline">$1</u>')
    // Inline code: `text`
    .replace(/`(.*?)`/g, '<code class="bg-[#1e1f22] px-1.5 py-0.5 rounded font-mono text-xs text-[#e3e5e8] border border-white/5">$1</code>')
    // Line breaks
    .replace(/\n/g, '<br />');

  return html;
}
