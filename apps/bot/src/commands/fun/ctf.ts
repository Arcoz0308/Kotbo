import type { SlashCommandDefinition } from '../../commands.js';
import { 
  SlashCommandBuilder, 
  type ChatInputCommandInteraction,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { handleCtfFlagSubmission } from '../../services/features/eventService.js';
import { logger } from '../../utils/logger.js';

const data = new SlashCommandBuilder()
  .setName('ctf')
  .setDescription('🚩 Commandes liées au Capture The Flag (CTF)')
  .addSubcommand(sub =>
    sub
      .setName('claim')
      .setDescription('🚩 Soumettre un flag pour avancer dans le CTF')
      .addStringOption(opt =>
        opt
          .setName('flag')
          .setDescription('Le flag à soumettre (ex: FLAG{...})')
          .setRequired(true)
      )
  );

async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'claim') {
    return handleClaim(interaction);
  }
}

async function handleClaim(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({ content: '❌ Cette commande doit être utilisée sur un serveur.', ephemeral: true });
  }

  const flag = interaction.options.getString('flag', true);

  try {
    // Trouver le CTF en cours sur le serveur
    const activeCtf = await prisma.event.findFirst({
      where: {
        guildId,
        type: 'CTF',
        status: 'ONGOING',
      },
    });

    if (!activeCtf) {
      return interaction.reply({ content: "❌ Aucun CTF n'est actuellement en cours sur ce serveur.", ephemeral: true });
    }

    return await handleCtfFlagSubmission(interaction, activeCtf.id, flag);
  } catch (err) {
    logger.error('CtfCommand', 'Error handling claim:', err);
    return interaction.reply({ content: '❌ Une erreur est survenue lors de la soumission du flag.', ephemeral: true });
  }
}

export const ctfCommand = { data, execute } satisfies SlashCommandDefinition;
