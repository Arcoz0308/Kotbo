import { ApplicationCommandType, ContextMenuCommandBuilder } from 'discord.js';
import type { ContextCommandDefinition } from '../../commands.js';
import { openMessageHub, openUserHub } from '../../services/core/contextMenuHubService.js';

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

const userHubData = new ContextMenuCommandBuilder()
  .setName('⚡ Actions Kotbo')
  .setType(ApplicationCommandType.User);

const messageHubData = new ContextMenuCommandBuilder()
  .setName('⚡ Actions Kotbo')
  .setType(ApplicationCommandType.Message);

export const userHubContextCommand = {
  data: userHubData,
  execute: openUserHub,
} satisfies ContextCommandDefinition;

export const messageHubContextCommand = {
  data: messageHubData,
  execute: openMessageHub,
} satisfies ContextCommandDefinition;
