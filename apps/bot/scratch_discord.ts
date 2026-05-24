import { Client, GatewayIntentBits, TextChannel } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.on('ready', async () => {
  console.log('Bot logged in as', client.user?.tag);
  
  // Hardcoded channel ID from the ticket we've seen (or just any channel)
  const channelId = process.env.TEST_CHANNEL_ID || '1336421389771128873'; // We'll just fetch a generic channel
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch instanceof TextChannel) {
      console.log('Fetching messages...');
      const fetched = await ch.messages.fetch({ limit: 5 });
      const messages = fetched.map(m => ({
        id: m.id,
        authorName: m.member?.displayName || m.author.displayName || m.author.username,
        attachments: m.attachments.map(a => ({ url: a.url, contentType: a.contentType })),
        embeds: m.embeds.map(e => ({ title: e.title, description: e.description, color: e.hexColor, fields: e.fields })),
        createdAt: m.createdAt.toISOString()
      }));
      console.log(JSON.stringify(messages, null, 2));
    } else {
      console.log('Channel is not text channel', ch);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
