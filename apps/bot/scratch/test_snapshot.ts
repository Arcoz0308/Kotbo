
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

import { Client, GatewayIntentBits } from 'discord.js';
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

import { runActivitySnapshot } from '../src/events/advancedLogs.js';

client.on('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}`);
  try {
    await runActivitySnapshot(client);
    console.log('Snapshot completed successfully.');
  } catch (e) {
    console.error('Snapshot failed:', e);
  }
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
