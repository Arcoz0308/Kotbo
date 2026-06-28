export function channelDisplayName(channel: { name: string; type?: string }): string {
  switch (channel.type) {
    case 'voice': return `🔊 ${channel.name}`;
    case 'forum': return `💬 ${channel.name}`;
    case 'media': return `📷 ${channel.name}`;
    case 'thread': return `🧵 ${channel.name}`;
    case 'announcement': return `📢 ${channel.name}`;
    default: return `# ${channel.name}`;
  }
}
