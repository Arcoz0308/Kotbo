import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  type ChatInputCommandInteraction,
  ComponentType,
} from 'discord.js';
import { COLORS_RAW, text } from './embeds.js';

export interface PaginationOptions {
  interaction: ChatInputCommandInteraction;
  items: string[];
  pageSize: number;
  title: string;
  color?: number;
  footerPrefix?: string;
}

export async function createPagination(opts: PaginationOptions) {
  const { interaction, items, pageSize, title, color = COLORS_RAW.primary, footerPrefix = '' } = opts;
  const totalPages = Math.ceil(items.length / pageSize);

  const generateContainer = (pageIndex: number) => {
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    const pageItems = items.slice(start, end);

    const container = new ContainerBuilder()
      .setAccentColor(color)
      .addTextDisplayComponents(text(`### ${title}`))
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(pageItems.join('\n') || '*Aucun élément.*'));

    const footerParts: string[] = [];
    if (footerPrefix) footerParts.push(footerPrefix);
    if (totalPages > 1) footerParts.push(`Page ${pageIndex + 1}/${totalPages}`);
    footerParts.push(`Demandé par ${interaction.user.username}`);

    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(text(`-# ${footerParts.join(' · ')}`));

    return container;
  };

  if (totalPages <= 1) {
    return interaction.editReply({
      components: [generateContainer(0)],
      flags: MessageFlags.IsComponentsV2,
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
    components: [generateContainer(currentPage), generateButtons(currentPage)],
    flags: MessageFlags.IsComponentsV2,
  });

  const collector = message.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    componentType: ComponentType.Button,
    time: 60000,
  });

  collector.on('collect', async (i) => {
    if (i.customId === 'prev') currentPage = Math.max(0, currentPage - 1);
    else if (i.customId === 'next') currentPage = Math.min(totalPages - 1, currentPage + 1);

    await i.update({
      components: [generateContainer(currentPage), generateButtons(currentPage)],
      flags: MessageFlags.IsComponentsV2,
    });
  });

  collector.on('end', async () => {
    try {
      const currentButtons = generateButtons(currentPage);
      const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...currentButtons.components.map(b => ButtonBuilder.from(b).setDisabled(true)),
      );
      await interaction.editReply({
        components: [generateContainer(currentPage), disabledRow],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch { /* message may have been deleted */ }
  });
}
