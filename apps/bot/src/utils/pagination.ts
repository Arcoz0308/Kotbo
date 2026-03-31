import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  ComponentType,
  type ColorResolvable,
} from 'discord.js';

export interface PaginationOptions {
  interaction: ChatInputCommandInteraction;
  items: string[];
  pageSize: number;
  title: string;
  color?: ColorResolvable;
  footerPrefix?: string;
}

/**
 * Creates a paginated embed message with Next/Prev buttons.
 * Only the original user can interact with the buttons.
 * The buttons are disabled after 60 seconds.
 */
export async function createPagination(opts: PaginationOptions) {
  const { interaction, items, pageSize, title, color, footerPrefix = '' } = opts;
  const totalPages = Math.ceil(items.length / pageSize);

  const generateEmbed = (pageIndex: number) => {
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    const pageItems = items.slice(start, end);

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(pageItems.join('\n') || 'Aucun élément.')
      .setColor(color ?? (0x5865f2 as ColorResolvable))
      .setTimestamp();

    if (totalPages > 1) {
      embed.setFooter({ 
        text: `${footerPrefix}${footerPrefix ? ' · ' : ''}Page ${pageIndex + 1} / ${totalPages}` 
      });
    } else if (footerPrefix) {
      embed.setFooter({ text: footerPrefix });
    }

    return embed;
  };

  if (totalPages <= 1) {
    return interaction.editReply({ 
      embeds: [generateEmbed(0)], 
      components: [] 
    });
  }

  let currentPage = 0;

  const generateButtons = (pageIndex: number) => {
    const prev = new ButtonBuilder()
      .setCustomId('prev')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === 0);

    const next = new ButtonBuilder()
      .setCustomId('next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === totalPages - 1);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next);
  };

  const message = await interaction.editReply({
    embeds: [generateEmbed(currentPage)],
    components: [generateButtons(currentPage)],
  });

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    componentType: ComponentType.Button,
    time: 60000,
  });

  collector.on('collect', async (i) => {
    if (i.customId === 'prev') {
      currentPage = Math.max(0, currentPage - 1);
    } else if (i.customId === 'next') {
      currentPage = Math.min(totalPages - 1, currentPage + 1);
    }

    await i.update({
      embeds: [generateEmbed(currentPage)],
      components: [generateButtons(currentPage)],
    });
  });

  collector.on('end', async () => {
    try {
      const currentButtons = generateButtons(currentPage);
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...currentButtons.components.map(b => ButtonBuilder.from(b).setDisabled(true))
      );
      await interaction.editReply({ components: [disabledRow] });
    } catch {
      // Ignore if message was deleted
    }
  });
}
