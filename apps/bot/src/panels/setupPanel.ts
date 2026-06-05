import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  BaseInteraction,
  type Client,
  type TextChannel,
  StringSelectMenuBuilder,
} from 'discord.js';
import prisma from '../utils/db.js';
import { COLORS } from '../utils/embeds.js';
import { acknowledgeInteraction, renderPanelTarget } from '../utils/interactionResponses.js';

export async function sendSetupWelcome(
  client: Client,
  guildId: string,
  target: TextChannel | BaseInteraction,
): Promise<void> {
  if (target instanceof BaseInteraction) {
    await acknowledgeInteraction(target);
  }
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🚀 Bienvenue sur Kotbo !')
    .setDescription(
      "Merci d'avoir choisi Kotbo. Ce guide va vous aider à configurer le bot étape par étape.\n\n" +
      "**Au programme :**\n" +
      "1️⃣ Salons de base (Config & Public)\n" +
      "2️⃣ Rôle Modérateur (Optionnel)\n" +
      "3️⃣ Auto-traduction (Optionnel)\n\n" +
      "Cliquez sur le bouton ci-dessous pour commencer."
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:step1')
      .setLabel('Commencer la configuration')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🏁')
  );

  await renderPanelTarget(target, { embeds: [embed], components: [row] });
}

export async function sendSetupStep1(
  client: Client,
  guildId: string,
  target: TextChannel | BaseInteraction,
): Promise<void> {
  if (target instanceof BaseInteraction) {
    await acknowledgeInteraction(target);
  }
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Étape 1 : Salons de base')
    .setDescription(
      "Nous avons besoin de deux salons principaux pour le fonctionnement global :\n\n" +
      "**1. Salon de Config/Modération :** Où les alertes de gestion arrivent.\n" +
      "**2. Salon Public :** Le salon principal pour les annonces automatiques.\n\n" +
      (guild?.configChannelId && guild?.publicChannelId 
        ? `✅ Actuellement configuré :\n- Config : <#${guild.configChannelId}>\n- Public : <#${guild.publicChannelId}>` 
        : "Veuillez sélectionner les salons ci-dessous.")
    );

  const configSelect = new ChannelSelectMenuBuilder()
    .setCustomId('setup:select_config_channel')
    .setPlaceholder('Sélectionner le salon de CONFIG...')
    .addChannelTypes(ChannelType.GuildText);

  const publicSelect = new ChannelSelectMenuBuilder()
    .setCustomId('setup:select_public_channel')
    .setPlaceholder('Sélectionner le salon PUBLIC...')
    .addChannelTypes(ChannelType.GuildText);

  const row1 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(configSelect);
  const row2 = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(publicSelect);
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:step2')
      .setLabel('Suivant')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!guild?.configChannelId || !guild?.publicChannelId)
  );

  await renderPanelTarget(target, { embeds: [embed], components: [row1, row2, row3] });
}

export async function sendSetupStep2(
  client: Client,
  guildId: string,
  target: TextChannel | BaseInteraction,
): Promise<void> {
  if (target instanceof BaseInteraction) {
    await acknowledgeInteraction(target);
  }
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Étape 2 : Rôle Modérateur')
    .setDescription(
      "Par défaut, seuls les administrateurs peuvent configurer le bot.\n" +
      "Vous pouvez définir un rôle spécifique dont les membres pourront aussi accéder aux commandes staff.\n\n" +
      (guild?.moderatorRoleId 
        ? `✅ Rôle actuel : <@&${guild.moderatorRoleId}>` 
        : "Aucun rôle configuré (Admin uniquement).")
    );

  const select = new RoleSelectMenuBuilder()
    .setCustomId('setup:select_mod_role')
    .setPlaceholder('Sélectionner un rôle (optionnel)...');

  const row1 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select);
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('setup:step1').setLabel('Précédent').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('setup:step3').setLabel('Suivant').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('setup:reset_mod_role').setLabel('Réinitialiser').setStyle(ButtonStyle.Danger)
  );

  await renderPanelTarget(target, { embeds: [embed], components: [row1, row2] });
}

export async function sendSetupStep3(
  client: Client,
  guildId: string,
  target: TextChannel | BaseInteraction,
): Promise<void> {
  if (target instanceof BaseInteraction) {
    await acknowledgeInteraction(target);
  }
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Étape 3 : Auto-traduction')
    .setDescription(
      "Kotbo peut traduire automatiquement les contenus étrangers vers une langue cible.\n\n" +
      `Statut actuel : **${guild?.translationEnabled ? '🟢 Activé' : '🔴 Désactivé'}**\n` +
      `Langue cible : **${guild?.defaultTranslateTo ?? 'FR'}**`
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:trans_toggle')
      .setLabel(guild?.translationEnabled ? 'Désactiver la traduction' : 'Activer la traduction')
      .setStyle(guild?.translationEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
  );

  const langSelect = new StringSelectMenuBuilder()
    .setCustomId('setup:trans_lang')
    .setPlaceholder('Langue cible...')
    .addOptions([
      { label: 'Français', value: 'FR', emoji: '🇫🇷' },
      { label: 'English', value: 'EN', emoji: '🇬🇧' },
      { label: 'Español', value: 'ES', emoji: '🇪🇸' },
      { label: 'Deutsch', value: 'DE', emoji: '🇩🇪' },
    ]);

  const rowLang = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(langSelect);
  const rowNav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('setup:step2').setLabel('Précédent').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('setup:finish').setLabel('Terminer').setStyle(ButtonStyle.Success)
  );

  await renderPanelTarget(target, { embeds: [embed], components: [row1, rowLang, rowNav] });
}

export async function sendSetupFinish(
  client: Client,
  guildId: string,
  target: TextChannel | BaseInteraction,
): Promise<void> {
  if (target instanceof BaseInteraction) {
    await acknowledgeInteraction(target);
  }
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });

  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('✅ Configuration terminée !')
    .setDescription(
      "Votre bot Kotbo est maintenant prêt à l'emploi !\n\n" +
      "**Résumé de votre configuration :**\n" +
      `📡 **Salons :** Config : <#${guild?.configChannelId}> | Public : <#${guild?.publicChannelId}>\n` +
      `🛡️ **Rôle Mod :** ${guild?.moderatorRoleId ? `<@&${guild.moderatorRoleId}>` : 'Admin uniquement'}\n` +
      `🌐 **Traduction :** ${guild?.translationEnabled ? `Activé (${guild.defaultTranslateTo})` : 'Désactivée'}\n\n` +
      "*Vous pouvez modifier ces paramètres à tout moment via le tableau de bord.*"
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('config:refresh')
      .setLabel('Ouvrir le Tableau de Bord')
      .setStyle(ButtonStyle.Primary)
  );

  await renderPanelTarget(target, { embeds: [embed], components: [row] });
}
