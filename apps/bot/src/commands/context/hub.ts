import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import type { ContextCommandDefinition } from '../../commands.js';
import { openMessageHub, openUserHub } from '../../services/core/contextMenuHubService.js';
import { getCommandMetadata } from '../../utils/i18n.js';

/**
 * Entrées « hub » des menus contextuels.
 *
 * Elles ne portent aucune logique : elles ouvrent le panneau qui liste les
 * actions du registre (`contextActionRegistry.ts`) autorisées pour le membre.
 * Ajouter une feature = ajouter une entrée au registre, pas un slot Discord.
 *
 * Les deux entrées partagent volontairement le même nom : Discord distingue les
 * menus User et Message par leur type.
 */

const hubMeta = getCommandMetadata('c6_hub_context');

const userHubData = new ContextMenuCommandBuilder()
  .setName(hubMeta.name)
  .setNameLocalizations(hubMeta.nameLocalizations)
  .setType(ApplicationCommandType.User);

const messageHubData = new ContextMenuCommandBuilder()
  .setName(hubMeta.name)
  .setNameLocalizations(hubMeta.nameLocalizations)
  .setType(ApplicationCommandType.Message);

export const userHubContextCommand = {
  data: userHubData,
  execute: openUserHub,
} satisfies ContextCommandDefinition;

export const messageHubContextCommand = {
  data: messageHubData,
  execute: openMessageHub,
} satisfies ContextCommandDefinition;
