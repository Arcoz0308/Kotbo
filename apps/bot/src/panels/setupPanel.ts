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
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder,
} from 'discord.js';
import prisma from '../utils/db.js';
import { COLORS } from '../utils/embeds.js';
import { renderPanelTarget } from '../utils/interactionResponses.js';

export async function sendSetupWelcome(
  client: Client,
  guildId: string,
  target: TextChannel | BaseInteraction,
): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('🚀 Bienvenue sur Kotbo !')
    .setDescription(
      "Merci d'avoir choisi Kotbo pour gérer vos news. Ce guide va vous aider à configurer le bot étape par étape.\n\n" +
      "**Au programme :**\n" +
      "1️⃣ Salons de base (Config & Public)\n" +
      "2️⃣ Rôle Modérateur (Optionnel)\n" +
      "3️⃣ Flux YouTube (Optionnel)\n" +
      "4️⃣ Digest de news (Optionnel)\n" +
      "5️⃣ Auto-traduction (Optionnel)\n\n" +
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
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Étape 1 : Salons de base')
    .setDescription(
      "Nous avons besoin de deux salons principaux :\n\n" +
      "**1. Salon de Config/Modération :** Où les news arrivent pour être validées.\n" +
      "**2. Salon Public :** Où les news validées sont publiées.\n\n" +
      (guild?.configChannelId && guild?.publicChannelId 
        ? `✅ Actuellement configuré :\n- Config : <#${guild.configChannelId}>\n- Public : <#${guild.publicChannelId}>` 
        : "Veuillez sélectionner les salons ci-dessous.")
    );

  const configSelect = new ChannelSelectMenuBuilder()
    .setCustomId('setup:select_config_channel')
    .setPlaceholder('Sélectionner le salon de MODÉRATION...')
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
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Étape 2 : Rôle Modérateur')
    .setDescription(
      "Par défaut, seuls les administrateurs peuvent valider les news.\n" +
      "Vous pouvez définir un rôle spécifique dont les membres pourront aussi modérer.\n\n" +
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
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Étape 3 : Flux YouTube')
    .setDescription(
      "Voulez-vous activer la gestion des vidéos YouTube ?\n" +
      "Cela permet de suivre des chaînes et de notifier les nouvelles vidéos.\n\n" +
      `Statut actuel : **${guild?.youtubeEnabled ? '🟢 Activé' : '🔴 Désactivé'}**`
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:yt_toggle')
      .setLabel(guild?.youtubeEnabled ? 'Désactiver YouTube' : 'Activer YouTube')
      .setStyle(guild?.youtubeEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
  );

  if (guild?.youtubeEnabled) {
    embed.addFields(
      { name: 'Salon YouTube', value: guild.youtubeChannelId ? `<#${guild.youtubeChannelId}>` : '❌ Par défaut (Public)', inline: true },
      { name: 'Rôle Vidéos', value: guild.youtubeVideoRoleId ? `<@&${guild.youtubeVideoRoleId}>` : '❌ Aucun', inline: true }
    );
    
    // Add specific settings for YT if enabled
    const chanSelect = new ChannelSelectMenuBuilder()
      .setCustomId('setup:yt_channel')
      .setPlaceholder('Salon pour les vidéos (optionnel)...')
      .addChannelTypes(ChannelType.GuildText);

    const shortRoleSelect = new RoleSelectMenuBuilder()
      .setCustomId('setup:select_yt_short_role')
      .setPlaceholder('Rôle pour les SHORTS (optionnel)...');

    const videoRoleSelect = new RoleSelectMenuBuilder()
      .setCustomId('setup:select_yt_video_role')
      .setPlaceholder('Rôle pour les VIDÉOS (optionnel)...');

    const rowChan = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(chanSelect);
    const rowShort = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(shortRoleSelect);
    const rowVideo = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(videoRoleSelect);
    
    const rowNav = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setup:step2').setLabel('Précédent').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setup:step4').setLabel('Suivant').setStyle(ButtonStyle.Primary)
    );

    await renderPanelTarget(target, { embeds: [embed], components: [row1, rowChan, rowShort, rowVideo, rowNav] });
  } else {
    const rowNav = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setup:step2').setLabel('Précédent').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setup:step4').setLabel('Suivant').setStyle(ButtonStyle.Primary)
    );
    await renderPanelTarget(target, { embeds: [embed], components: [row1, rowNav] });
  }
}

export async function sendSetupStep4(
  client: Client,
  guildId: string,
  target: TextChannel | BaseInteraction,
): Promise<void> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Étape 4 : Digest de News')
    .setDescription(
      "Le Digest envoie un récapitulatif périodique des news validées.\n\n" +
      `Statut actuel : **${guild?.digestEnabled ? '🟢 Activé' : '🔴 Désactivé'}**`
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup:digest_toggle')
      .setLabel(guild?.digestEnabled ? 'Désactiver le Digest' : 'Activer le Digest')
      .setStyle(guild?.digestEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
  );

  if (guild?.digestEnabled) {
    embed.addFields(
      { name: 'Fréquence', value: guild.digestFrequency === 'WEEKLY' ? 'Hebdomadaire' : 'Quotidienne', inline: true },
      { name: 'Heure', value: guild.digestTime, inline: true }
    );

    const freqSelect = new StringSelectMenuBuilder()
      .setCustomId('setup:digest_freq')
      .setPlaceholder('Fréquence du digest...')
      .addOptions([
        { label: 'Quotidien', value: 'DAILY', emoji: '📆' },
        { label: 'Hebdomadaire', value: 'WEEKLY', emoji: '📅' },
      ]);

    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId('setup:select_digest_role')
      .setPlaceholder('Rôle à mentionner (optionnel)...');

    const rowFreq = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(freqSelect);
    const rowRole = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect);
    const rowTime = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setup:digest_time_btn').setLabel("Heure d'envoi").setStyle(ButtonStyle.Secondary).setEmoji('⌚'),
      new ButtonBuilder().setCustomId('setup:digest_clear_role').setLabel('SANS rôle mention').setStyle(ButtonStyle.Danger)
    );
    const rowNav = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setup:step3').setLabel('Précédent').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setup:step5').setLabel('Suivant').setStyle(ButtonStyle.Primary)
    );

    await renderPanelTarget(target, { embeds: [embed], components: [row1, rowFreq, rowRole, rowTime, rowNav] });
  } else {
    const rowNav = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('setup:step3').setLabel('Précédent').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('setup:step5').setLabel('Suivant').setStyle(ButtonStyle.Primary)
    );
    await renderPanelTarget(target, { embeds: [embed], components: [row1, rowNav] });
  }
}

export async function sendSetupStep5(
  client: Client,
  guildId: string,
  target: TextChannel | BaseInteraction,
): Promise<void> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Étape 5 : Auto-traduction')
    .setDescription(
      "Kotbo peut traduire automatiquement les news étrangères vers une langue cible.\n\n" +
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
    new ButtonBuilder().setCustomId('setup:step4').setLabel('Précédent').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('setup:finish').setLabel('Terminer').setStyle(ButtonStyle.Success)
  );

  await renderPanelTarget(target, { embeds: [embed], components: [row1, rowLang, rowNav] });
}

export async function sendSetupFinish(
  client: Client,
  guildId: string,
  target: TextChannel | BaseInteraction,
): Promise<void> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });

  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('✅ Configuration terminée !')
    .setDescription(
      "Votre bot Kotbo est maintenant prêt à l'emploi !\n\n" +
      "**Résumé de votre configuration :**\n" +
      `📡 **Salons :** Mod : <#${guild?.configChannelId}> | Public : <#${guild?.publicChannelId}>\n` +
      `🛡️ **Rôle Mod :** ${guild?.moderatorRoleId ? `<@&${guild.moderatorRoleId}>` : 'Admin uniquement'}\n` +
      `▶️ **YouTube :** ${guild?.youtubeEnabled ? 'Activé' : 'Désactivé'}\n` +
      `📅 **Digest :** ${guild?.digestEnabled ? 'Activé' : 'Désactivé'}\n` +
      `🌐 **Traduction :** ${guild?.translationEnabled ? `Activé (${guild.defaultTranslateTo})` : 'Désactivée'}\n\n` +
      "*Vous pouvez modifier ces paramètres à tout moment via le panneau de configuration.*"
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('config:refresh')
      .setLabel('Ouvrir le Panneau Complet')
      .setStyle(ButtonStyle.Primary)
  );

  await renderPanelTarget(target, { embeds: [embed], components: [row] });
}

export function buildSetupDigestModal(guild?: { digestTime?: string | null } | null): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('modal:setup:digest_time')
    .setTitle("⌚ Heure du Digest")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('digest_time')
          .setLabel("Heure d'envoi (HH:MM)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(5)
          .setValue(guild?.digestTime ?? '08:00'),
      ),
    );
}
