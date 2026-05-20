import { type TextChannel, type Message, type Guild } from 'discord.js';
import prisma from '../utils/db.js';
import { logger } from '../utils/logger.js';

/**
 * Escapes HTML tags to prevent XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Parses basic Discord markdown: **bold**, *italic*, __underline__, ~~strike~~, `code`, and blockquotes.
 */
function parseMarkdown(text: string, guild?: Guild): string {
  let escaped = escapeHtml(text);

  // Bold
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Underline
  escaped = escaped.replace(/__(.*?)__/g, '<u>$1</u>');
  
  // Strikethrough
  escaped = escaped.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // Inline Code
  escaped = escaped.replace(/`(.*?)`/g, '<code class="inline-code">$1</code>');

  // Block Code (multi-line)
  escaped = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="block-code language-${lang || 'plaintext'}">${code}</code></pre>`;
  });

  // User/Channel mentions
  if (guild) {
    escaped = escaped.replace(/&lt;@!?(\d+)&gt;/g, (_, id) => {
      const member = guild.members.cache.get(id);
      const user = guild.client.users.cache.get(id);
      const name = member?.displayName || user?.username || 'Utilisateur inconnu';
      return `<span class="mention">@${escapeHtml(name)}</span>`;
    });
    escaped = escaped.replace(/&lt;#(\d+)&gt;/g, (_, id) => {
      const ch = guild.channels.cache.get(id);
      return `<span class="mention">#${ch ? escapeHtml(ch.name) : 'salon-inconnu'}</span>`;
    });
    escaped = escaped.replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => {
      const role = guild.roles.cache.get(id);
      return `<span class="mention">@${role ? escapeHtml(role.name) : 'rôle-inconnu'}</span>`;
    });
  } else {
    escaped = escaped.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@Utilisateur</span>');
    escaped = escaped.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#salon</span>');
    escaped = escaped.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@Rôle</span>');
  }

  return escaped;
}

/**
 * Generates an HTML transcript of all messages in a channel and stores it in the DB.
 */
export async function generateTranscript(channel: TextChannel): Promise<{ id: string; url: string; count: number }> {
  logger.info('Transcript', `Génération de la transcription pour #${channel.name} (${channel.id})...`);
  
  // 1. Fetch ALL messages in chronological order
  let allMessages: Message[] = [];
  let lastId: string | undefined;

  while (true) {
    const options = { limit: 100, before: lastId };
    const messages = await channel.messages.fetch(options);
    if (messages.size === 0) break;
    allMessages.push(...messages.values());
    lastId = messages.last()?.id;
  }

  // Reverse so they are in chronological order (oldest to newest)
  allMessages.reverse();

  return generateTranscriptFromMessages(channel, allMessages);
}

export async function generateTranscriptFromMessages(channel: TextChannel, allMessages: Message[]): Promise<{ id: string; url: string; count: number }> {
  // 2. Build the HTML content
  let messagesHtml = '';
  
  for (const msg of allMessages) {
    const author = msg.author;
    const avatarUrl = author.displayAvatarURL({ size: 64 });
    const username = msg.member?.displayName || author.displayName || author.username;
    
    // Role color fallback
    const roleColor = msg.member?.roles.highest?.color 
      ? '#' + msg.member.roles.highest.color.toString(16).padStart(6, '0') 
      : '#f2f3f5';

    const timestamp = msg.createdAt.toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let bodyHtml = '';
    if (msg.content) {
      bodyHtml += `<div class="message-text">${parseMarkdown(msg.content, channel.guild)}</div>`;
    }

    // Process attachments
    if (msg.attachments.size > 0) {
      for (const [_, attachment] of msg.attachments) {
        const contentType = attachment.contentType || '';
        if (contentType.startsWith('image/')) {
          bodyHtml += `<img src="${attachment.url}" class="discord-img" alt="Image jointe" loading="lazy" />`;
        } else if (contentType.startsWith('video/')) {
          bodyHtml += `<video src="${attachment.url}" controls class="discord-video"></video>`;
        } else {
          // File download card
          const fileSize = (attachment.size / 1024).toFixed(1) + ' KB';
          bodyHtml += `
            <div class="attachment-card">
              <span class="attachment-icon">📁</span>
              <div class="attachment-info">
                <a href="${attachment.url}" target="_blank" class="attachment-name">${escapeHtml(attachment.name)}</a>
                <span class="attachment-size">${fileSize}</span>
              </div>
            </div>
          `;
        }
      }
    }

    // Process embeds
    if (msg.embeds.length > 0) {
      for (const embed of msg.embeds) {
        const borderHex = embed.hexColor || '#1e1f22';
        bodyHtml += `
          <div class="discord-embed" style="border-left-color: ${borderHex}">
            ${embed.author ? `<div class="discord-embed-author">${escapeHtml(embed.author.name || '')}</div>` : ''}
            ${embed.title ? `<div class="discord-embed-title">${escapeHtml(embed.title)}</div>` : ''}
            ${embed.description ? `<div class="discord-embed-description">${parseMarkdown(embed.description, channel.guild)}</div>` : ''}
            ${embed.fields && embed.fields.length > 0 ? `
              <div class="discord-embed-fields">
                ${embed.fields.map(f => `
                  <div class="discord-embed-field ${f.inline ? 'inline' : ''}">
                    <div class="discord-embed-field-name">${escapeHtml(f.name)}</div>
                    <div class="discord-embed-field-value">${parseMarkdown(f.value, channel.guild)}</div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `;
      }
    }

    // Process reactions
    if (msg.reactions.cache.size > 0) {
      bodyHtml += '<div class="reactions-list">';
      for (const [_, reaction] of msg.reactions.cache) {
        const emoji = reaction.emoji.name;
        const count = reaction.count;
        bodyHtml += `<span class="reaction-tag">${emoji} <span class="reaction-count">${count}</span></span>`;
      }
      bodyHtml += '</div>';
    }

    messagesHtml += `
      <div class="message-group">
        <img class="avatar" src="${avatarUrl}" alt="${escapeHtml(author.username)}" />
        <div class="message-content">
          <div class="message-header">
            <span class="username" style="color: ${roleColor}">${escapeHtml(username)}</span>
            ${author.bot ? '<span class="bot-tag">BOT</span>' : ''}
            <span class="timestamp">${timestamp}</span>
          </div>
          ${bodyHtml}
        </div>
      </div>
    `;
  }

  // Generate full HTML template
  const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Transcription Kotbo - #${channel.name}</title>
  <style>
    body {
      background-color: #313338;
      color: #dbdee1;
      font-family: 'gg sans', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 24px;
      display: flex;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 900px;
      background-color: #313338;
    }
    .transcript-header {
      border-bottom: 1px solid #3f4147;
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .channel-name {
      font-size: 26px;
      font-weight: 700;
      color: #f2f3f5;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .channel-hashtag {
      color: #80848e;
      font-size: 32px;
      font-weight: 300;
    }
    .channel-topic {
      font-size: 14px;
      color: #949ba4;
      margin-top: 6px;
      line-height: 1.4;
    }
    .message-group {
      display: flex;
      margin-bottom: 20px;
      gap: 16px;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: #5865F2;
      flex-shrink: 0;
    }
    .message-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: calc(100% - 56px);
    }
    .message-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .username {
      font-weight: 600;
      font-size: 16px;
      cursor: pointer;
    }
    .username:hover {
      text-decoration: underline;
    }
    .bot-tag {
      background-color: #5865f2;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 4.5px;
      border-radius: 3px;
      line-height: 1.3;
    }
    .timestamp {
      font-size: 12px;
      color: #949ba4;
    }
    .message-text {
      font-size: 15px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
      color: #dbdee1;
    }
    .inline-code {
      background: #1e1f22;
      padding: 2px 4px;
      border-radius: 4px;
      font-family: Consolas, Andale Mono WT, Andale Mono, Lucida Console, Monaco, monospace;
      font-size: 85%;
    }
    .block-code {
      display: block;
      background: #1e1f22;
      border: 1px solid #2b2d31;
      padding: 10px;
      border-radius: 4px;
      font-family: Consolas, Andale Mono WT, Andale Mono, Lucida Console, Monaco, monospace;
      font-size: 90%;
      color: #dbdee1;
      overflow-x: auto;
      margin: 8px 0;
    }
    .mention {
      color: #c9cdfb;
      background-color: rgba(88, 101, 242, 0.3);
      padding: 0 4px;
      border-radius: 3px;
      font-weight: 500;
      transition: background-color 0.05s ease;
    }
    .mention:hover {
      background-color: #5865f2;
      color: #ffffff;
    }
    .attachment-card {
      background-color: #2b2d31;
      border: 1px solid #1e1f22;
      border-radius: 8px;
      padding: 12px;
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 450px;
      margin-top: 8px;
    }
    .attachment-icon {
      font-size: 28px;
    }
    .attachment-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .attachment-name {
      color: #00a8fc;
      text-decoration: none;
      font-weight: 500;
      font-size: 14px;
    }
    .attachment-name:hover {
      text-decoration: underline;
    }
    .attachment-size {
      font-size: 12px;
      color: #949ba4;
    }
    .discord-img {
      max-width: 100%;
      max-height: 350px;
      border-radius: 8px;
      margin-top: 8px;
      display: block;
    }
    .discord-video {
      max-width: 100%;
      max-height: 350px;
      border-radius: 8px;
      margin-top: 8px;
      display: block;
    }
    .discord-embed {
      background-color: #2b2d31;
      border-left: 4px solid #1e1f22;
      border-radius: 4px;
      padding: 12px 16px;
      margin-top: 8px;
      max-width: 520px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .discord-embed-author {
      font-size: 13px;
      color: #f2f3f5;
      font-weight: 600;
    }
    .discord-embed-title {
      font-size: 16px;
      color: #00a8fc;
      font-weight: 600;
    }
    .discord-embed-description {
      font-size: 14px;
      color: #dbdee1;
      line-height: 1.4;
    }
    .discord-embed-fields {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 8px;
    }
    .discord-embed-field {
      flex: 1 1 100%;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .discord-embed-field.inline {
      flex: 1 1 45%;
    }
    .discord-embed-field-name {
      font-size: 12px;
      color: #949ba4;
      font-weight: 600;
    }
    .discord-embed-field-value {
      font-size: 14px;
      color: #dbdee1;
    }
    .reactions-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .reaction-tag {
      background-color: #2b2d31;
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 4px 8px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .reaction-count {
      color: #b5bac1;
      font-size: 12px;
      font-weight: 600;
    }
    .footer {
      border-top: 1px solid #3f4147;
      padding-top: 16px;
      margin-top: 36px;
      text-align: center;
      font-size: 12px;
      color: #949ba4;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="transcript-header">
      <div class="channel-name">
        <span class="channel-hashtag">#</span>
        <span>${escapeHtml(channel.name)}</span>
      </div>
      <div class="channel-topic">
        Transcription de salon générée par Kotbo · ${allMessages.length} messages transcrits.
        ${channel.topic ? `<br/><br/><strong>Sujet :</strong> ${escapeHtml(channel.topic)}` : ''}
      </div>
    </div>

    <div class="messages">
      ${messagesHtml}
    </div>

    <div class="footer">
      Généré avec amour par Kotbo · ${new Date().toLocaleDateString('fr-FR')} ${new Date().toLocaleTimeString('fr-FR')}
    </div>
  </div>
</body>
</html>`;

  // 3. Save to database
  const transcript = await prisma.transcript.create({
    data: {
      guildId: channel.guild.id,
      channelId: channel.id,
      channelName: channel.name,
      html: fullHtml
    }
  });

  const url = `/transcripts/${transcript.id}`;
  logger.success('Transcript', `Transcription générée avec succès pour #${channel.name} (${allMessages.length} messages) : ID ${transcript.id}`);

  return {
    id: transcript.id,
    url,
    count: allMessages.length
  };
}
