import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType,
  PermissionFlagsBits,
} from 'discord.js';
import prisma from '../../utils/db.js';
import { errorEmbed, successEmbed, COLORS } from '../../utils/embeds.js';
import { getOrCreateRpgProfile, claimDaily, startTravel, resolveTravel, chooseAdventureOutcome, buyShopItem, equipInventoryItem, consumePotionItem, createRpgGuild, joinRpgGuild, leaveRpgGuild, depositToRpgGuildTreasury, getOrCreateEconomyConfig, sellShopItem, adminSetStats, fish } from '../../services/features/economyService.js';
import {
  findRandomMonster,
  findBoss,
  listBosses,
  listDiscoveredMonsters,
  simulateBattle,
} from '../../services/features/combatService.js';

// Local interfaces to satisfy ESLint without using any
interface LocalRpgItem {
  id: string;
  name: string;
  description: string;
  emoji: string;
  type: string;
  atkBonus: number;
  defBonus: number;
  spdBonus: number;
  hpRestore: number;
  energyRestore: number;
  price: number;
}

interface LocalInventoryEntry {
  id: string;
  rpgProfileId: string;
  itemId: string;
  quantity: number;
  item: LocalRpgItem;
}

interface LocalGuildMember {
  userId: string;
  level: number;
}

// Progress bar helper
function getProgressBar(current: number, max: number, length = 10, fillEmoji = '🟩', emptyEmoji = '⬛'): string {
  const percent = Math.max(0, Math.min(1, current / max));
  const fillCount = Math.round(percent * length);
  const emptyCount = length - fillCount;
  return `${fillEmoji.repeat(fillCount)}${emptyEmoji.repeat(emptyCount)} (${Math.round(percent * 100)}%)`;
}

// Check if economy module is enabled
async function checkEconomyEnabled(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const config = await getOrCreateEconomyConfig(interaction.guildId!);
  if (!config.enabled) {
    await interaction.reply({
      embeds: [errorEmbed('Module Désactivé', "Le système d'économie et de RPG n'est pas activé sur ce serveur.")],
      flags: [MessageFlags.Ephemeral]
    });
    return false;
  }
  return true;
}

// 1. RPG PROFILE COMMAND
const rpgProfileData = new SlashCommandBuilder()
  .setName('rpg-profile')
  .setDescription("🛡️ Consulter votre profil RPG et votre solde d'économie")
  .addUserOption(option =>
    option
      .setName('membre')
      .setDescription('Le membre à inspecter (défaut : vous-même)')
      .setRequired(false)
  );

async function rpgProfileExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;

  const targetUser = interaction.options.getUser('membre') ?? interaction.user;
  const profile = await getOrCreateRpgProfile(interaction.guildId!, targetUser.id);
  const config = await getOrCreateEconomyConfig(interaction.guildId!);

  // Fetch equip details
  const weapon = profile.weaponId ? await prisma.rpgItem.findUnique({ where: { id: profile.weaponId } }) : null;
  const armor = profile.armorId ? await prisma.rpgItem.findUnique({ where: { id: profile.armorId } }) : null;

  const xpNeeded = profile.level * 100;

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ Profil RPG — ${targetUser.displayName}`)
    .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
    .setColor(COLORS.primary)
    .setDescription(profile.isTraveling ? `✈️ En voyage vers **${profile.travelDestination}**` : '🏡 Au repos dans la taverne')
    .addFields(
      { name: `${config.currencyEmoji} Portefeuille`, value: `**${profile.balance}** ${config.currencyName}`, inline: true },
      { name: '⭐ Niveau', value: `Niveau **${profile.level}**`, inline: true },
      { name: '⚡ Énergie', value: `${profile.energy} / ${config.maxEnergy}\n${getProgressBar(profile.energy, config.maxEnergy, 10, '⚡', '⚫')}`, inline: false },
      { name: '❤️ Points de Vie (PV)', value: `${profile.health} / ${profile.maxHealth}\n${getProgressBar(profile.health, profile.maxHealth, 10, '❤️', '🖤')}`, inline: false },
      { name: '📈 Expérience (XP)', value: `${profile.xp} / ${xpNeeded} XP\n${getProgressBar(profile.xp, xpNeeded, 10, '🟦', '⬛')}`, inline: false },
      {
        name: '⚔️ Statistiques combat',
        value: `💥 Attaque: **${profile.attack}**\n🛡️ Défense: **${profile.defense}**\n👟 Vitesse: **${profile.speed}**`,
        inline: true
      },
      {
        name: '🎒 Équipement équipé',
        value: `🗡️ Arme: **${weapon ? weapon.emoji + ' ' + weapon.name : 'Aucune'}**\n🦺 Armure: **${armor ? armor.emoji + ' ' + armor.name : 'Aucune'}**`,
        inline: true
      }
    );

  if (profile.rpgGuild) {
    embed.addFields({ name: '🛡️ Guilde', value: `${profile.rpgGuild.emoji} **${profile.rpgGuild.name}** (Niveau ${profile.rpgGuild.level})`, inline: false });
  }

  await interaction.reply({ embeds: [embed] });
}

export const rpgProfileCommand = { data: rpgProfileData, execute: rpgProfileExecute } satisfies SlashCommandDefinition;


// 2. DAILY COMMAND
const rpgDailyData = new SlashCommandBuilder()
  .setName('rpg-daily')
  .setDescription('🪙 Récupérer vos pièces quotidiennes gratuites');

async function rpgDailyExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;

  const result = await claimDaily(interaction.guildId!, interaction.user.id);
  const config = await getOrCreateEconomyConfig(interaction.guildId!);

  if (!result.success) {
    await interaction.reply({
      embeds: [errorEmbed('Daily indisponible', `Vous devez encore attendre **${result.remainingHours} heures et ${result.remainingMinutes} minutes** avant de pouvoir réclamer votre récompense.`)],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🪙 Récompense Journalière')
    .setDescription(`Vous avez récupéré **${result.reward}** ${config.currencyEmoji} **${config.currencyName}** !`)
    .addFields({ name: 'Nouveau solde', value: `**${result.newBalance}** ${config.currencyEmoji}` })
    .setColor(COLORS.success)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

export const rpgDailyCommand = { data: rpgDailyData, execute: rpgDailyExecute } satisfies SlashCommandDefinition;


// 3. TRAVEL / ADVENTURE COMMAND
const rpgTravelData = new SlashCommandBuilder()
  .setName('rpg-travel')
  .setDescription("✈️ Démarrer ou résoudre un voyage d'aventure");

async function rpgTravelExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const config = await getOrCreateEconomyConfig(guildId);

  if (!config.rpgEnabled) {
    await interaction.reply({
      embeds: [errorEmbed('RPG désactivé', "Le système d'aventures RPG est désactivé sur ce serveur.")],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  const profile = await getOrCreateRpgProfile(guildId, userId);

  // Case 1: Active Travel
  if (profile.isTraveling) {
    const status = await resolveTravel(guildId, userId);

    if (!status.complete) {
      await interaction.reply({
        embeds: [errorEmbed('Voyage en cours', `Vous êtes actuellement en voyage vers **${profile.travelDestination}**.\nTemps restant: **${status.remainingMinutes}** minutes.`)],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    if (status.noEvent) {
      await interaction.reply({
        embeds: [successEmbed('Voyage terminé', "Vous êtes bien arrivé à destination mais rien de particulier ne s'est passé en chemin.")]
      });
      return;
    }

    const event = status.event!;
    const choices = event.choices as unknown[];

    const embed = new EmbedBuilder()
      .setTitle(`${event.emoji} Événement de Voyage: ${event.title}`)
      .setDescription(event.description)
      .setColor(COLORS.primary)
      .setFooter({ text: 'Choisissez une action ci-dessous :' });

    const row = new ActionRowBuilder<ButtonBuilder>();
    choices.forEach((choice, idx) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`rpg_choice:${event.id}:${idx}`)
          .setLabel(choice.text.substring(0, 80))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(choice.minLevel && profile.level < choice.minLevel)
      );
    });

    const response = await interaction.reply({
      embeds: [embed],
      components: [row]
    });

    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000 // 1 minute to choose
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: "Ce n'est pas votre aventure !", flags: [MessageFlags.Ephemeral] });
        return;
      }

      await i.deferUpdate();
      const [_, evId, idxStr] = i.customId.split(':');
      const idx = parseInt(idxStr, 10);

      try {
        const resolution = await chooseAdventureOutcome(guildId, userId, evId, idx);
        
        const resolutionEmbed = new EmbedBuilder()
          .setTitle(`${event.emoji} Résolution: ${event.title}`)
          .setDescription(`Vous avez choisi : **${resolution.choiceText}**\n\n${resolution.criticalMessage || ''}`)
          .addFields(
            { name: '❤️ Effet de Vie (PV)', value: `${resolution.hpEffect >= 0 ? '+' : ''}${resolution.hpEffect} PV`, inline: true },
            { name: '🪙 KotboCoins', value: `${resolution.coinEffect >= 0 ? '+' : ''}${resolution.coinEffect} 🪙`, inline: true },
            { name: '⭐ XP', value: `+${resolution.xpEffect} XP`, inline: true }
          )
          .setColor(resolution.hpEffect < 0 ? COLORS.danger : COLORS.success);

        if (resolution.levelUp) {
          resolutionEmbed.addFields({ name: '🎉 NIVEAU SUPÉRIEUR !', value: `Félicitations, vous passez **Niveau ${resolution.levelUp}** ! Vos PV ont été restaurés et vos statistiques augmentées.` });
        }

        await interaction.editReply({
          embeds: [resolutionEmbed],
          components: []
        });
        collector.stop();
      } catch (err: unknown) {
        await interaction.editReply({
          embeds: [errorEmbed('Erreur résolution', err.message || 'Une erreur est survenue.')],
          components: []
        });
        collector.stop();
      }
    });

    return;
  }

  // Case 2: Inactive Travel — Choose destination
  const destinations = [
    { name: 'Forêt Mystique', time: 5, label: 'Forêt Mystique (5 min)' },
    { name: 'Montagnes du Destin', time: 15, label: 'Montagnes du Destin (15 min)' },
    { name: 'Marécage Maudit', time: 30, label: 'Marécage Maudit (30 min)' }
  ];

  const embed = new EmbedBuilder()
    .setTitle("✈️ Commencer un voyage d'aventure")
    .setDescription("Choisissez une destination ci-dessous. Voyager consomme **20 points d'énergie** et prend un certain temps réel.\nÀ la fin de la durée, lancez à nouveau la commande pour faire face à un événement aléatoire !")
    .setColor(COLORS.primary)
    .addFields({ name: 'Énergie actuelle', value: `${profile.energy} / ${config.maxEnergy}` });

  const row = new ActionRowBuilder<ButtonBuilder>();
  destinations.forEach((dest, idx) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`rpg_dest:${idx}`)
        .setLabel(dest.label)
        .setStyle(ButtonStyle.Primary)
    );
  });

  const response = await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: [MessageFlags.Ephemeral]
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30000
  });

  collector.on('collect', async (i) => {
    await i.deferUpdate();
    const idx = parseInt(i.customId.split(':')[1], 10);
    const dest = destinations[idx];

    try {
      await startTravel(guildId, userId, dest.name, dest.time);
      await interaction.editReply({
        embeds: [successEmbed('Bon voyage !', `Vous commencez votre voyage vers **${dest.name}**. Revenez dans **${dest.time} minutes** pour découvrir ce qui vous attend !`)],
        components: []
      });
      collector.stop();
    } catch (err: unknown) {
      await interaction.editReply({
        embeds: [errorEmbed('Énergie insuffisante', err.message || 'Impossible de voyager.')],
        components: []
      });
      collector.stop();
    }
  });
}

export const rpgTravelCommand = { data: rpgTravelData, execute: rpgTravelExecute } satisfies SlashCommandDefinition;


// 4. SHOP COMMAND
const rpgShopData = new SlashCommandBuilder()
  .setName('rpg-shop')
  .setDescription('🛒 Consulter la boutique et acheter des objets RPG');

async function rpgShopExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const config = await getOrCreateEconomyConfig(guildId);

  if (!config.shopEnabled) {
    await interaction.reply({
      embeds: [errorEmbed('Boutique désactivée', 'La boutique RPG est désactivée sur ce serveur.')],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  const profile = await getOrCreateRpgProfile(guildId, userId);
  const items = await prisma.rpgItem.findMany({
    where: {
      OR: [
        { guildId: null },
        { guildId }
      ],
      purchasable: true
    },
    orderBy: { price: 'asc' }
  });

  if (items.length === 0) {
    await interaction.reply({ content: 'La boutique est vide actuellement.', flags: [MessageFlags.Ephemeral] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🛒 Boutique RPG')
    .setDescription(`Achetez des objets pour améliorer vos statistiques et voyager en toute sécurité !\nVotre Solde: **${profile.balance}** ${config.currencyEmoji}`)
    .setColor(COLORS.primary);

  // Group items by type for nice display
  const typesMap: Record<string, string> = { WEAPON: '🗡️ Armes', ARMOR: '🦺 Armures', POTION: '🧪 Potions', QUEST: '🔑 Objets de quête' };
  const groupedItems = items.reduce((acc: Record<string, LocalRpgItem[]>, item: unknown) => {
    const localItem = item as LocalRpgItem;
    acc[localItem.type] = acc[localItem.type] || [];
    acc[localItem.type].push(localItem);
    return acc;
  }, {} as Record<string, LocalRpgItem[]>);

  for (const [type, itemArray] of Object.entries(groupedItems)) {
    const list = itemArray.map((item: LocalRpgItem) => {
      let stats = '';
      if (item.atkBonus) stats += ` (ATK +${item.atkBonus})`;
      if (item.defBonus) stats += ` (DEF +${item.defBonus})`;
      if (item.hpRestore) stats += ` (Restaure ${item.hpRestore} HP)`;
      return `${item.emoji} **${item.name}** - **${item.price}** 🪙\n*${item.description}*${stats}`;
    }).join('\n');
    embed.addFields({ name: typesMap[type] || type, value: list || 'Vide' });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('rpg_buy')
    .setPlaceholder('Sélectionnez un objet à acheter...');

  items.slice(0, 25).forEach((item: unknown) => {
    const localItem = item as LocalRpgItem;
    select.addOptions({
      label: localItem.name,
      description: `${localItem.price} coins — ${localItem.description.substring(0, 60)}`,
      value: localItem.id,
      emoji: localItem.emoji
    });
  });

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const response = await interaction.reply({
    embeds: [embed],
    components: [selectRow],
    flags: [MessageFlags.Ephemeral]
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 30000
  });

  collector.on('collect', async (i) => {
    await i.deferUpdate();
    const itemId = i.values[0];

    try {
      const buyResult = await buyShopItem(guildId, userId, itemId);
      await interaction.editReply({
        embeds: [successEmbed('Achat réussi !', `Vous avez acheté **${buyResult.itemName}** pour **${buyResult.price}** 🪙.\nNouveau solde: **${buyResult.newBalance}** 🪙.`)],
        components: []
      });
      collector.stop();
    } catch (err: unknown) {
      await interaction.editReply({
        embeds: [errorEmbed('Achat échoué', err.message || "Impossible d'effectuer l'achat.")],
        components: []
      });
      collector.stop();
    }
  });
}

export const rpgShopCommand = { data: rpgShopData, execute: rpgShopExecute } satisfies SlashCommandDefinition;


// 5. INVENTORY COMMAND
const rpgInventoryData = new SlashCommandBuilder()
  .setName('rpg-inventory')
  .setDescription('🎒 Gérer votre sac à dos, équiper vos armes et utiliser vos potions');

async function rpgInventoryExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  const profile = await getOrCreateRpgProfile(guildId, userId);
  const inventory = profile.inventory;

  if (inventory.length === 0) {
    await interaction.reply({
      embeds: [errorEmbed('Sac vide', 'Votre inventaire est vide ! Achetez des potions et des armes dans le `/rpg-shop`.')],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🎒 Votre Inventaire RPG')
    .setDescription('Utilisez le menu ci-dessous pour équiper une arme/armure ou boire une potion de soin/énergie.')
    .setColor(COLORS.primary);

  const list = inventory.map((entry: unknown) => {
    const localEntry = entry as LocalInventoryEntry;
    const item = localEntry.item;
    let desc = `${item.emoji} **${item.name}** (x${localEntry.quantity}) - *${item.type}*`;
    if (item.id === profile.weaponId) desc += ' 🟢 *(Équipé)*';
    if (item.id === profile.armorId) desc += ' 🟢 *(Équipé)*';
    return desc;
  }).join('\n');

  embed.addFields({ name: 'Contenu du sac à dos', value: list });

  const select = new StringSelectMenuBuilder()
    .setCustomId('rpg_use')
    .setPlaceholder('Choisissez un objet à équiper ou consommer...');

  inventory.forEach((entry: unknown) => {
    const localEntry = entry as LocalInventoryEntry;
    const item = localEntry.item;
    const isEquipped = item.id === profile.weaponId || item.id === profile.armorId;
    select.addOptions({
      label: `${item.name} (x${localEntry.quantity})`,
      description: isEquipped ? 'Déjà équipé' : item.type === 'POTION' ? 'Consommer la potion' : 'Équiper cet objet',
      value: item.id,
      emoji: item.emoji
    });
  });

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const response = await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: [MessageFlags.Ephemeral]
  });

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    time: 30000
  });

  collector.on('collect', async (i) => {
    await i.deferUpdate();
    const itemId = i.values[0];
    const selectedEntry = inventory.find((e: unknown) => (e as LocalInventoryEntry).item.id === itemId) as LocalInventoryEntry | undefined;

    if (!selectedEntry) return;

    try {
      const item = selectedEntry.item;
      if (item.type === 'POTION') {
        const result = await consumePotionItem(guildId, userId, itemId);
        await interaction.editReply({
          embeds: [successEmbed('Potion consommée', `Vous buvez **${result.itemName}**.\n❤️ PV restaurés: +${result.restoredHp} (Total: ${result.newHp} PV)\n⚡ Énergie restaurée: +${result.restoredEnergy} (Total: ${result.newEnergy})`)],
          components: []
        });
      } else {
        const result = await equipInventoryItem(guildId, userId, itemId);
        await interaction.editReply({
          embeds: [successEmbed('Objet équipé', `Vous avez équipé l'objet **${result.itemName}** en tant que **${result.type}** !`)],
          components: []
        });
      }
      collector.stop();
    } catch (err: unknown) {
      await interaction.editReply({
        embeds: [errorEmbed('Action échouée', err.message || 'Impossible de faire cette action.')],
        components: []
      });
      collector.stop();
    }
  });
}

export const rpgInventoryCommand = { data: rpgInventoryData, execute: rpgInventoryExecute } satisfies SlashCommandDefinition;


// 6. GUILD COMMANDS
const rpgGuildData = new SlashCommandBuilder()
  .setName('rpg-guild')
  .setDescription('🛡️ Gérer votre guilde RPG et vos trésors')
  .addSubcommand(sub =>
    sub
      .setName('info')
      .setDescription('Consulter les informations de votre guilde')
  )
  .addSubcommand(sub =>
    sub
      .setName('create')
      .setDescription('Créer une nouvelle guilde RPG (Coût: 500 Coins)')
      .addStringOption(opt =>
        opt
          .setName('nom')
          .setDescription('Nom de la guilde')
          .setRequired(true)
          .setMaxLength(32)
      )
      .addStringOption(opt =>
        opt
          .setName('description')
          .setDescription('Brève description')
          .setRequired(false)
          .setMaxLength(256)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('join')
      .setDescription('Rejoindre une guilde existante')
      .addStringOption(opt =>
        opt
          .setName('nom')
          .setDescription('Le nom exact de la guilde cible')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub
      .setName('leave')
      .setDescription('Quitter votre guilde actuelle')
  )
  .addSubcommand(sub =>
    sub
      .setName('deposit')
      .setDescription('Faire un don de KotboCoins à la trésorerie de votre guilde')
      .addIntegerOption(opt =>
        opt
          .setName('montant')
          .setDescription('Le montant à déposer')
          .setRequired(true)
          .setMinValue(1)
      )
  );

async function rpgGuildExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const config = await getOrCreateEconomyConfig(guildId);

  if (!config.guildsEnabled) {
    await interaction.reply({
      embeds: [errorEmbed('Guildes désactivées', 'Le système de guildes RPG est désactivé sur ce serveur.')],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  // A. INFO
  if (sub === 'info') {
    const profile = await getOrCreateRpgProfile(guildId, userId);
    if (!profile.rpgGuildId) {
      await interaction.reply({
        embeds: [errorEmbed('Pas de guilde', "Vous n'appartenez à aucune guilde. Créez-en une avec `/rpg-guild create` ou rejoignez-en une avec `/rpg-guild join`.")],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const rpgGuild = await prisma.rpgGuild.findUnique({
      where: { id: profile.rpgGuildId },
      include: { members: true }
    });

    if (!rpgGuild) return;

    const xpNeeded = rpgGuild.level * 1000;
    const membersList = rpgGuild.members.map((m: unknown) => `<@${(m as LocalGuildMember).userId}> (Niveau ${(m as LocalGuildMember).level})`).join(', ');

    const embed = new EmbedBuilder()
      .setTitle(`${rpgGuild.emoji} Guilde: ${rpgGuild.name}`)
      .setDescription(rpgGuild.description || '*Aucune description.*')
      .setColor(COLORS.primary)
      .addFields(
        { name: '⭐ Niveau de la guilde', value: `Niveau **${rpgGuild.level}**`, inline: true },
        { name: '🪙 Trésor de guilde', value: `**${rpgGuild.treasury}** KotboCoins`, inline: true },
        { name: '📈 Progression XP', value: `${rpgGuild.xp} / ${xpNeeded} XP\n${getProgressBar(rpgGuild.xp, xpNeeded, 10, '🟨', '⬛')}`, inline: false },
        { name: '👥 Membres', value: membersList || 'Aucun membre.' }
      );

    await interaction.reply({ embeds: [embed] });
    return;
  }

  // B. CREATE
  if (sub === 'create') {
    const name = interaction.options.getString('nom', true);
    const desc = interaction.options.getString('description') ?? undefined;

    try {
      const rpgGuild = await createRpgGuild(guildId, userId, name, desc);
      await interaction.reply({
        embeds: [successEmbed('Guilde créée !', `La guilde **${rpgGuild.name}** a été créée avec succès.\n500 KotboCoins ont été déduits de votre compte.`)]
      });
    } catch (err: unknown) {
      await interaction.reply({
        embeds: [errorEmbed('Création échouée', err.message || 'Impossible de créer la guilde.')],
        flags: [MessageFlags.Ephemeral]
      });
    }
    return;
  }

  // C. JOIN
  if (sub === 'join') {
    const name = interaction.options.getString('nom', true);

    const targetGuild = await prisma.rpgGuild.findFirst({
      where: { guildId, name: { equals: name, mode: 'insensitive' } }
    });

    if (!targetGuild) {
      await interaction.reply({
        embeds: [errorEmbed('Guilde introuvable', "Aucune guilde avec ce nom n'existe sur ce serveur.")],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    try {
      await joinRpgGuild(guildId, userId, targetGuild.id);
      await interaction.reply({
        embeds: [successEmbed('Bienvenue !', `Vous avez rejoint la guilde **${targetGuild.name}**.`)]
      });
    } catch (err: unknown) {
      await interaction.reply({
        embeds: [errorEmbed('Action échouée', err.message || 'Impossible de rejoindre la guilde.')],
        flags: [MessageFlags.Ephemeral]
      });
    }
    return;
  }

  // D. LEAVE
  if (sub === 'leave') {
    try {
      const result = await leaveRpgGuild(guildId, userId);
      if (result.dissolved) {
        await interaction.reply({
          embeds: [successEmbed('Guilde dissoute', 'Comme vous étiez le dernier membre de la guilde, celle-ci a été dissoute.')]
        });
      } else {
        await interaction.reply({
          embeds: [successEmbed('Départ réussi', `Vous avez quitté la guilde **${result.guildName}**.`)]
        });
      }
    } catch (err: unknown) {
      await interaction.reply({
        embeds: [errorEmbed('Erreur', err.message || 'Impossible de quitter la guilde.')],
        flags: [MessageFlags.Ephemeral]
      });
    }
    return;
  }

  // E. DEPOSIT
  if (sub === 'deposit') {
    const amount = interaction.options.getInteger('montant', true);

    try {
      const depositResult = await depositToRpgGuildTreasury(guildId, userId, amount);
      const resEmbed = successEmbed('Dépôt enregistré', `Vous avez déposé **${depositResult.amount}** 🪙 dans le coffre commun.`);
      if (depositResult.levelUp) {
        resEmbed.addFields({ name: '🎉 NIVEAU DE GUILDE SUPÉRIEUR !', value: `Grâce à votre don, la guilde passe au **Niveau ${depositResult.levelUp}** !` });
      }
      await interaction.reply({ embeds: [resEmbed] });
    } catch (err: unknown) {
      await interaction.reply({
        embeds: [errorEmbed('Dépôt échoué', err.message || 'Impossible de déposer cette somme.')],
        flags: [MessageFlags.Ephemeral]
      });
    }
    return;
  }
}

export const rpgGuildCommand = { data: rpgGuildData, execute: rpgGuildExecute } satisfies SlashCommandDefinition;


// 7. PAY COMMAND
const rpgPayData = new SlashCommandBuilder()
  .setName('rpg-pay')
  .setDescription('💸 Envoyer des KotboCoins à un autre membre')
  .addUserOption(option =>
    option
      .setName('membre')
      .setDescription('Le membre destinataire')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option
      .setName('montant')
      .setDescription('Le montant de pièces à envoyer')
      .setRequired(true)
      .setMinValue(1)
  );

async function rpgPayExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;

  const guildId = interaction.guildId!;
  const senderId = interaction.user.id;
  const receiver = interaction.options.getUser('membre', true);
  const amount = interaction.options.getInteger('montant', true);

  if (receiver.bot) {
    await interaction.reply({ embeds: [errorEmbed('Erreur', "Vous ne pouvez pas envoyer d'argent à un bot !")], flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (receiver.id === senderId) {
    await interaction.reply({ embeds: [errorEmbed('Erreur', "Vous ne pouvez pas vous envoyer d'argent à vous-même !")], flags: [MessageFlags.Ephemeral] });
    return;
  }

  const senderProfile = await getOrCreateRpgProfile(guildId, senderId);

  if (senderProfile.balance < amount) {
    await interaction.reply({
      embeds: [errorEmbed('Solde insuffisant', `Vous n'avez pas assez de KotboCoins (actuel: ${senderProfile.balance} 🪙).`)],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  const receiverProfile = await getOrCreateRpgProfile(guildId, receiver.id);

  await prisma.$transaction([
    prisma.rpgProfile.update({
      where: { id: senderProfile.id },
      data: { balance: { decrement: amount } }
    }),
    prisma.rpgProfile.update({
      where: { id: receiverProfile.id },
      data: { balance: { increment: amount } }
    })
  ]);

  const config = await getOrCreateEconomyConfig(guildId);
  const embed = successEmbed('Transaction réussie !', `Vous avez envoyé **${amount}** ${config.currencyEmoji} à <@${receiver.id}>.`)
    .addFields(
      { name: 'Votre nouveau solde', value: `**${senderProfile.balance - amount}** ${config.currencyEmoji}`, inline: true },
      { name: 'Leur nouveau solde', value: `**${receiverProfile.balance + amount}** ${config.currencyEmoji}`, inline: true }
    );

  await interaction.reply({ embeds: [embed] });
}

export const rpgPayCommand = { data: rpgPayData, execute: rpgPayExecute } satisfies SlashCommandDefinition;

// 8. SELL COMMAND
const rpgSellData = new SlashCommandBuilder()
  .setName('rpg-sell')
  .setDescription('🪙 Revendre un objet de votre inventaire à 50% de sa valeur boutique')
  .addStringOption(option =>
    option
      .setName('objet')
      .setDescription("Le nom de l'objet à vendre")
      .setRequired(true)
  );

async function rpgSellExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const query = interaction.options.getString('objet', true).toLowerCase();

  try {
    const profile = await getOrCreateRpgProfile(guildId, userId);
    
    // Find matching item in inventory
    const entry = profile.inventory.find((e: unknown) => 
      (e as LocalInventoryEntry).item.name.toLowerCase().includes(query)
    ) as LocalInventoryEntry | undefined;

    if (!entry) {
      await interaction.reply({
        embeds: [errorEmbed('Objet non trouvé', `Vous ne possédez pas d'objet correspondant à "${query}" dans votre inventaire.`)],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    const sellResult = await sellShopItem(guildId, userId, entry.item.id);
    
    const embed = successEmbed('Vente réussie !', `Vous avez vendu **${sellResult.itemName}** pour **${sellResult.sellPrice}** 🪙.`)
      .addFields({ name: 'Nouveau solde', value: `**${sellResult.newBalance}** 🪙` });

    await interaction.reply({ embeds: [embed] });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : "Impossible de vendre l'objet.";
    await interaction.reply({
      embeds: [errorEmbed('Erreur vente', errMsg)],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const rpgSellCommand = { data: rpgSellData, execute: rpgSellExecute } satisfies SlashCommandDefinition;

// 9. DROP COMMAND
const rpgDropData = new SlashCommandBuilder()
  .setName('rpg-drop')
  .setDescription("🎁 Faire tomber des KotboCoins ou de l'XP RPG dans le salon")
  .addStringOption(option =>
    option
      .setName('type')
      .setDescription('Type de ressource à drop')
      .setRequired(true)
      .addChoices(
        { name: 'KotboCoins 🪙', value: 'COINS' },
        { name: 'Expérience ⭐', value: 'XP' }
      )
  )
  .addIntegerOption(option =>
    option
      .setName('quantite')
      .setDescription('Le montant à drop')
      .setRequired(true)
      .setMinValue(1)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function rpgDropExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;

  const type = interaction.options.getString('type', true);
  const amount = interaction.options.getInteger('quantite', true);
  const guildId = interaction.guildId!;

  try {
    const drop = await prisma.rpgDrop.create({
      data: {
        guildId,
        amount,
        type
      }
    });

    const isCoins = type === 'COINS';
    const resourceName = isCoins ? 'KotboCoins 🪙' : 'XP RPG ⭐';

    const embed = new EmbedBuilder()
      .setTitle('🎁 Un drop est apparu !')
      .setDescription(`Un administrateur a fait tomber **${amount}** **${resourceName}** dans ce salon !\nSoyez le premier à cliquer sur le bouton ci-dessous pour les récupérer !`)
      .setColor(COLORS.primary)
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rpg_drop_claim:${drop.id}`)
        .setLabel('Réclamer 🎁')
        .setStyle(ButtonStyle.Success)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row]
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Impossible de créer le drop.';
    await interaction.reply({
      embeds: [errorEmbed('Erreur drop', errMsg)],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const rpgDropCommand = { data: rpgDropData, execute: rpgDropExecute } satisfies SlashCommandDefinition;

// 10. ADMIN COMMANDS
const rpgAdminData = new SlashCommandBuilder()
  .setName('rpg-admin')
  .setDescription("⚙️ Gérer le système RPG et d'économie (Admin uniquement)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('set-balance')
      .setDescription("Modifier le solde d'un joueur")
      .addUserOption(opt => opt.setName('membre').setDescription('Le membre cible').setRequired(true))
      .addIntegerOption(opt => opt.setName('solde').setDescription('Le nouveau solde').setRequired(true).setMinValue(0))
  )
  .addSubcommand(sub =>
    sub
      .setName('set-level')
      .setDescription("Modifier le niveau RPG d'un joueur")
      .addUserOption(opt => opt.setName('membre').setDescription('Le membre cible').setRequired(true))
      .addIntegerOption(opt => opt.setName('niveau').setDescription('Le nouveau niveau').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub
      .setName('set-xp')
      .setDescription("Modifier les points d'expérience RPG d'un joueur")
      .addUserOption(opt => opt.setName('membre').setDescription('Le membre cible').setRequired(true))
      .addIntegerOption(opt => opt.setName('xp').setDescription("Le nouveau montant d'XP").setRequired(true).setMinValue(0))
  )
  .addSubcommand(sub =>
    sub
      .setName('reset')
      .setDescription('Réinitialiser un composant du système RPG/économie')
      .addStringOption(opt =>
        opt
          .setName('composant')
          .setDescription('Le composant à réinitialiser')
          .setRequired(true)
          .addChoices(
            { name: 'Tout réinitialiser (Global)', value: 'all' },
            { name: 'Profils des joueurs (Comptes, inventaires...)', value: 'profiles' },
            { name: 'Objets de la boutique', value: 'items' },
            { name: "Configuration de l'économie", value: 'config' },
            { name: 'Guildes RPG', value: 'guilds' }
          )
      )
  );

async function rpgAdminExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;

  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId!;

  if (sub === 'reset') {
    const component = interaction.options.getString('composant', true) as 'all' | 'profiles' | 'items' | 'config' | 'guilds';

    // Send a confirmation prompt to avoid accidental deletion
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Confirmation de Réinitialisation')
      .setDescription(`Êtes-vous sûr de vouloir réinitialiser le composant **${component}** de l'économie/RPG ? Cette action est **irréversible** !`)
      .setColor(COLORS.warning);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`rpg_reset_confirm:${component}`)
        .setLabel('Confirmer la réinitialisation')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('rpg_reset_cancel')
        .setLabel('Annuler')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  const targetUser = interaction.options.getUser('membre', true);
  if (targetUser.bot) {
    await interaction.reply({
      embeds: [errorEmbed('Erreur', "Impossible de modifier les stats d'un bot.")],
      flags: [MessageFlags.Ephemeral]
    });
    return;
  }

  try {
    const stats: Parameters<typeof adminSetStats>[2] = {};
    let desc = '';

    if (sub === 'set-balance') {
      const balance = interaction.options.getInteger('solde', true);
      stats.balance = balance;
      desc = `Le solde de <@${targetUser.id}> a été mis à **${balance}** pièces.`;
    } else if (sub === 'set-level') {
      const level = interaction.options.getInteger('niveau', true);
      stats.level = level;
      desc = `Le niveau RPG de <@${targetUser.id}> a été mis à **${level}**.`;
    } else if (sub === 'set-xp') {
      const xp = interaction.options.getInteger('xp', true);
      stats.xp = xp;
      desc = `L'expérience RPG de <@${targetUser.id}> a été mise à **${xp}** XP.`;
    }

    await adminSetStats(guildId, targetUser.id, stats);
    await interaction.reply({
      embeds: [successEmbed('Statistiques mises à jour', desc)]
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Impossible de modifier les statistiques.';
    await interaction.reply({
      embeds: [errorEmbed('Erreur modification', errMsg)],
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export const rpgAdminCommand = { data: rpgAdminData, execute: rpgAdminExecute } satisfies SlashCommandDefinition;


// ============================================================================
// RPG-FIGHT — Combat contre un monstre aléatoire
// ============================================================================

const rpgFightData = new SlashCommandBuilder()
  .setName('rpg-fight')
  .setDescription('⚔️ Combattre un monstre aléatoire adapté à votre niveau');

async function rpgFightExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  const config = await getOrCreateEconomyConfig(guildId);
  if (!config.rpgEnabled) {
    await interaction.reply({ embeds: [errorEmbed('RPG désactivé', "Le système RPG n'est pas activé.")], flags: [MessageFlags.Ephemeral] });
    return;
  }

  const profile = await getOrCreateRpgProfile(guildId, userId);

  if (profile.lastBattle) {
    const diff = Date.now() - profile.lastBattle.getTime();
    if (diff < 2 * 60 * 1000) {
      const remaining = Math.ceil((2 * 60 * 1000 - diff) / 1000);
      await interaction.reply({ embeds: [errorEmbed('Cooldown', `Vous devez attendre encore **${remaining}s** avant de combattre à nouveau.`)], flags: [MessageFlags.Ephemeral] });
      return;
    }
  }

  if (profile.energy < 15) {
    await interaction.reply({ embeds: [errorEmbed('Énergie insuffisante', `Il vous faut **15 énergie** pour combattre. Vous avez **${profile.energy}**.`)], flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (profile.health <= 5) {
    await interaction.reply({ embeds: [errorEmbed('PV trop bas', 'Vos PV sont trop bas pour combattre. Reposez-vous ou utilisez une potion !')], flags: [MessageFlags.Ephemeral] });
    return;
  }

  await interaction.deferReply();

  await prisma.rpgProfile.update({
    where: { guildId_userId: { guildId, userId } },
    data: { energy: { decrement: 15 } }
  });

  const monster = await findRandomMonster(guildId, profile.level);
  if (!monster) {
    await interaction.editReply({ embeds: [errorEmbed('Aucun monstre', 'Aucun monstre disponible pour votre niveau.')] });
    return;
  }

  const weapon = profile.weaponId
    ? await prisma.rpgItem.findUnique({ where: { id: profile.weaponId } })
    : null;
  const armor = profile.armorId
    ? await prisma.rpgItem.findUnique({ where: { id: profile.armorId } })
    : null;

  const playerAtk = profile.attack + (weapon?.atkBonus ?? 0);
  const playerDef = profile.defense + (armor?.defBonus ?? 0);
  const playerSpd = profile.speed + (weapon?.spdBonus ?? 0) + (armor?.spdBonus ?? 0);
  const playerMaxHp = profile.maxHealth;

  let playerHp = profile.health;
  let monsterHp = monster.health;
  const monsterMaxHp = monster.health;

  const getPotions = () => prisma.rpgInventoryItem.findMany({
    where: {
      rpgProfileId: profile.id,
      item: { type: 'POTION' },
      quantity: { gte: 1 }
    },
    include: { item: true }
  });

  const buildHpBar = (current: number, max: number) => {
    const barsCount = 10;
    const filled = Math.max(0, Math.min(barsCount, Math.round((current / max) * barsCount)));
    const empty = barsCount - filled;
    return `[${'🟩'.repeat(filled)}${'🟥'.repeat(empty)}] \`${current}/${max} PV\``;
  };

  const getEmbed = (turnsLog: string[]) => {
    const logs = turnsLog.slice(-5).join('\n') || '*Le combat commence...*';
    return new EmbedBuilder()
      .setTitle(`⚔️ Combat : Vous vs ${monster.emoji} ${monster.name}`)
      .setDescription(
        `${monster.description}\n\n` +
        `**Vous** :\n${buildHpBar(playerHp, playerMaxHp)}\n\n` +
        `**${monster.emoji} ${monster.name}** (Niveau ${monster.level}) :\n${buildHpBar(monsterHp, monsterMaxHp)}\n\n` +
        `**Journal de combat** :\n${logs}`
      )
      .setColor('#5865F2')
      .setTimestamp();
  };

  const getActionRow = async () => {
    const userPotions = await getPotions();
    const potionsCount = userPotions.reduce((sum, p) => sum + p.quantity, 0);

    const attackBtn = new ButtonBuilder()
      .setCustomId('combat_attack')
      .setLabel('Attaquer')
      .setEmoji('⚔️')
      .setStyle(ButtonStyle.Primary);

    const defendBtn = new ButtonBuilder()
      .setCustomId('combat_defend')
      .setLabel('Défendre')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Secondary);

    const potionBtn = new ButtonBuilder()
      .setCustomId('combat_potion')
      .setLabel(`Potion (${potionsCount})`)
      .setEmoji('🧪')
      .setStyle(ButtonStyle.Success)
      .setDisabled(potionsCount === 0);

    const fleeBtn = new ButtonBuilder()
      .setCustomId('combat_flee')
      .setLabel('Fuir')
      .setEmoji('🏃')
      .setStyle(ButtonStyle.Danger);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(attackBtn, defendBtn, potionBtn, fleeBtn);
  };

  const message = await interaction.editReply({
    embeds: [getEmbed([])],
    components: [await getActionRow()]
  });

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === userId,
    time: 60 * 1000
  });

  const turnsLog: string[] = [];
  let isDefending = false;
  let totalDamageDealt = 0;
  let totalDamageTaken = 0;

  collector.on('collect', async (btnInt) => {
    try {
      await btnInt.deferUpdate();
      collector.resetTimer();

      isDefending = false;
      let actionTaken = '';

      if (btnInt.customId === 'combat_attack') {
        const critical = Math.random() < 0.1;
        const baseDmg = Math.max(1, playerAtk - Math.floor(monster.defense / 2)) + Math.floor(Math.random() * Math.max(1, Math.floor(playerSpd / 3)));
        const damage = critical ? Math.floor(baseDmg * 1.5) : baseDmg;
        monsterHp = Math.max(0, monsterHp - damage);
        totalDamageDealt += damage;
        actionTaken = `🗡️ Vous infligez **${damage}** dégâts${critical ? ' **CRITIQUE !**' : ''} au ${monster.name}.`;
      } else if (btnInt.customId === 'combat_defend') {
        isDefending = true;
        actionTaken = `🛡️ Vous vous mettez en posture défensive.`;
      } else if (btnInt.customId === 'combat_potion') {
        const userPotions = await getPotions();
        if (userPotions.length === 0) {
          actionTaken = `❌ Vous n'avez pas de potions !`;
        } else {
          const potItem = userPotions[0];
          const restored = potItem.item.hpRestore;
          playerHp = Math.min(playerMaxHp, playerHp + restored);
          
          if (potItem.quantity > 1) {
            await prisma.rpgInventoryItem.update({ where: { id: potItem.id }, data: { quantity: { decrement: 1 } } });
          } else {
            await prisma.rpgInventoryItem.delete({ where: { id: potItem.id } });
          }
          actionTaken = `🧪 Vous buvez une **${potItem.item.name}** (+${restored} PV).`;
        }
      } else if (btnInt.customId === 'combat_flee') {
        turnsLog.push(`🏃 Vous fuyez le combat !`);
        collector.stop('fled');
        return;
      }

      turnsLog.push(actionTaken);

      if (monsterHp <= 0) {
        collector.stop('victory');
        return;
      }

      // Tour du monstre
      const monsterCrit = Math.random() < 0.08;
      const monsterBaseDmg = Math.max(1, monster.attack - Math.floor((playerDef * (isDefending ? 2 : 1)) / 2)) + Math.floor(Math.random() * Math.max(1, Math.floor(monster.speed / 3)));
      const monsterDamage = monsterCrit ? Math.floor(monsterBaseDmg * 1.5) : monsterBaseDmg;
      playerHp = Math.max(0, playerHp - monsterDamage);
      totalDamageTaken += monsterDamage;
      turnsLog.push(`${monster.emoji} Le ${monster.name} vous inflige **${monsterDamage}** dégâts${monsterCrit ? ' **CRITIQUE !**' : ''}.`);

      if (playerHp <= 0) {
        collector.stop('defeat');
        return;
      }

      await interaction.editReply({
        embeds: [getEmbed(turnsLog)],
        components: [await getActionRow()]
      });

    } catch (err) {
      console.error(err);
    }
  });

  collector.on('end', async (_, reason) => {
    try {
      const row = await getActionRow();
      row.components.forEach(c => c.setDisabled(true));

      if (reason === 'fled') {
        await prisma.rpgProfile.update({
          where: { guildId_userId: { guildId, userId } },
          data: { health: playerHp, lastBattle: new Date() }
        });

        const fledEmbed = new EmbedBuilder()
          .setTitle(`🏃 Fuite — ${monster.emoji} ${monster.name}`)
          .setDescription(
            `Vous avez fui le combat !\n\n` +
            `**Vous** :\n${buildHpBar(playerHp, playerMaxHp)}\n` +
            `**${monster.name}** :\n${buildHpBar(monsterHp, monsterMaxHp)}`
          )
          .setColor('#FFA500')
          .setTimestamp();

        await interaction.editReply({ embeds: [fledEmbed], components: [row] });
        return;
      }

      if (reason === 'time') {
        await prisma.rpgProfile.update({
          where: { guildId_userId: { guildId, userId } },
          data: { health: playerHp, lastBattle: new Date() }
        });

        const timeoutEmbed = new EmbedBuilder()
          .setTitle(`⏳ Combat interrompu`)
          .setDescription(`Vous avez mis trop de temps à répondre. Le combat s'est arrêté.`)
          .setColor('#808080')
          .setTimestamp();

        await interaction.editReply({ embeds: [timeoutEmbed], components: [row] });
        return;
      }

      if (reason === 'victory') {
        const xpEarned = monster.xpReward + Math.floor(Math.random() * Math.floor(monster.xpReward * 0.3));
        let coinsEarned = monster.coinReward + Math.floor(Math.random() * Math.floor(monster.coinReward * 0.3));

        let itemDropped: string | null = null;
        let itemDropEmoji: string | null = null;
        
        const drops = (Array.isArray(monster.drops) ? monster.drops : JSON.parse(String(monster.drops || '[]'))) as { itemName: string; chance: number; emoji?: string; coinBonus?: number }[];
        for (const drop of drops) {
          if (Math.random() < drop.chance) {
            itemDropped = drop.itemName;
            itemDropEmoji = drop.emoji || null;
            if (drop.coinBonus) coinsEarned += drop.coinBonus;

            const dropItem = await prisma.rpgItem.findFirst({
              where: {
                OR: [{ guildId: null }, { guildId }],
                name: drop.itemName
              }
            });
            if (dropItem) {
              await prisma.rpgInventoryItem.upsert({
                where: { rpgProfileId_itemId: { rpgProfileId: profile.id, itemId: dropItem.id } },
                update: { quantity: { increment: 1 } },
                create: { rpgProfileId: profile.id, itemId: dropItem.id, quantity: 1 }
              });
            }
            break;
          }
        }

        await prisma.rpgProfile.update({
          where: { guildId_userId: { guildId, userId } },
          data: {
            health: Math.max(1, playerHp),
            balance: { increment: coinsEarned },
            xp: { increment: xpEarned },
            totalMonstersKilled: !monster.isBoss ? { increment: 1 } : undefined,
            totalBossesKilled: monster.isBoss ? { increment: 1 } : undefined,
            lastBattle: new Date()
          }
        });

        await prisma.rpgBattle.create({
          data: {
            guildId, userId, monsterId: monster.id, monsterName: monster.name, won: true,
            damageDealt: totalDamageDealt, damageTaken: totalDamageTaken, xpEarned, coinsEarned, itemDropped
          }
        });

        const { checkLevelUp } = await import('../../services/features/economyService.js');
        const beforeLevel = profile.level;
        await checkLevelUp(guildId, userId);
        const afterProfile = await prisma.rpgProfile.findUnique({ where: { guildId_userId: { guildId, userId } } });
        const levelUp = afterProfile && afterProfile.level > beforeLevel ? afterProfile.level : null;

        const victoryEmbed = new EmbedBuilder()
          .setTitle(`🏆 Victoire — ${monster.emoji} ${monster.name}`)
          .setDescription(
            `Vous avez vaincu le **${monster.name}** !\n\n` +
            `**Vous** :\n${buildHpBar(playerHp, playerMaxHp)}\n\n` +
            `**Journal de combat** :\n${turnsLog.slice(-4).join('\n')}`
          )
          .setColor(COLORS.success)
          .addFields(
            { name: '💥 Dégâts infligés', value: `${totalDamageDealt}`, inline: true },
            { name: '🩸 Dégâts reçus', value: `${totalDamageTaken}`, inline: true },
            { name: '⭐ XP gagné', value: `+${xpEarned}`, inline: true },
            { name: `${config.currencyEmoji} Pièces gagnées`, value: `+${coinsEarned}`, inline: true },
          )
          .setTimestamp();

        if (itemDropped) {
          victoryEmbed.addFields({ name: '🎁 Drop !', value: `${itemDropEmoji || '📦'} **${itemDropped}**`, inline: true });
        }

        if (levelUp) {
          victoryEmbed.addFields({ name: '🎉 NIVEAU SUPÉRIEUR !', value: `Vous passez au **Niveau ${levelUp}** !` });
        }

        await interaction.editReply({ embeds: [victoryEmbed], components: [row] });
        return;
      }

      if (reason === 'defeat') {
        const xpEarned = Math.floor(monster.xpReward * 0.15);

        await prisma.rpgProfile.update({
          where: { guildId_userId: { guildId, userId } },
          data: {
            health: 1,
            xp: { increment: xpEarned },
            lastBattle: new Date()
          }
        });

        await prisma.rpgBattle.create({
          data: {
            guildId, userId, monsterId: monster.id, monsterName: monster.name, won: false,
            damageDealt: totalDamageDealt, damageTaken: totalDamageTaken, xpEarned, coinsEarned: 0, itemDropped: null
          }
        });

        const defeatEmbed = new EmbedBuilder()
          .setTitle(`💀 Défaite — ${monster.emoji} ${monster.name}`)
          .setDescription(
            `Vous avez succombé face au **${monster.name}**...\n\n` +
            `**Vous** :\n${buildHpBar(0, playerMaxHp)}\n\n` +
            `**Journal de combat** :\n${turnsLog.slice(-4).join('\n')}`
          )
          .setColor(COLORS.danger)
          .addFields(
            { name: '💥 Dégâts infligés', value: `${totalDamageDealt}`, inline: true },
            { name: '🩸 Dégâts reçus', value: `${totalDamageTaken}`, inline: true },
            { name: '⭐ XP gagné', value: `+${xpEarned}`, inline: true },
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [defeatEmbed], components: [row] });
        return;
      }
    } catch (err) {
      console.error(err);
    }
  });
}

export const rpgFightCommand = { data: rpgFightData, execute: rpgFightExecute } satisfies SlashCommandDefinition;


// ============================================================================
// RPG-BOSS — Combat de boss
// ============================================================================

const rpgBossData = new SlashCommandBuilder()
  .setName('rpg-boss')
  .setDescription('🐲 Affronter un boss puissant')
  .addStringOption(option =>
    option.setName('boss').setDescription('Nom du boss à affronter').setRequired(true).setAutocomplete(true)
  );

async function rpgBossExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  const config = await getOrCreateEconomyConfig(guildId);
  if (!config.rpgEnabled) {
    await interaction.reply({ embeds: [errorEmbed('RPG désactivé', "Le système RPG n'est pas activé.")], flags: [MessageFlags.Ephemeral] });
    return;
  }

  const bossName = interaction.options.getString('boss', true);
  const boss = await findBoss(guildId, bossName);
  if (!boss) {
    await interaction.reply({ embeds: [errorEmbed('Boss introuvable', `Aucun boss nommé **${bossName}** n'a été trouvé.`)], flags: [MessageFlags.Ephemeral] });
    return;
  }

  const profile = await getOrCreateRpgProfile(guildId, userId);

  if (profile.level < boss.level) {
    await interaction.reply({ embeds: [errorEmbed('Niveau insuffisant', `Ce boss requiert le **Niveau ${boss.level}**. Vous êtes Niveau **${profile.level}**.`)], flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (profile.energy < 30) {
    await interaction.reply({ embeds: [errorEmbed('Énergie insuffisante', `Il vous faut **30 énergie** pour un boss. Vous avez **${profile.energy}**.`)], flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (profile.health <= 10) {
    await interaction.reply({ embeds: [errorEmbed('PV trop bas', 'Vos PV sont trop bas pour affronter un boss !')], flags: [MessageFlags.Ephemeral] });
    return;
  }

  await interaction.deferReply();

  await prisma.rpgProfile.update({
    where: { guildId_userId: { guildId, userId } },
    data: { energy: { decrement: 30 } }
  });

  const result = await simulateBattle(profile, boss);
  const turnSummary = result.turns.slice(-8).map(t => {
    const who = t.attacker === 'player' ? '🗡️ Vous' : `${boss.emoji} ${boss.name}`;
    const crit = t.critical ? ' **CRITIQUE !**' : '';
    return `${who} inflige **${t.damage}** dégâts${crit}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`${result.won ? '👑 Boss Vaincu !' : '💀 Défaite contre le Boss'} — ${boss.emoji} ${boss.name}`)
    .setDescription(
      `${boss.description}\n\n` +
      `**Résumé du combat** (${result.turns.length} tours)\n${turnSummary}`
    )
    .setColor(result.won ? COLORS.success : COLORS.danger)
    .addFields(
      { name: '💥 Dégâts infligés', value: `${result.totalDamageDealt}`, inline: true },
      { name: '🩸 Dégâts reçus', value: `${result.totalDamageTaken}`, inline: true },
      { name: '❤️ PV restants', value: `${result.playerHpRemaining} / ${profile.maxHealth}`, inline: true },
      { name: '⭐ XP gagné', value: `+${result.xpEarned}`, inline: true },
      { name: `${config.currencyEmoji} Pièces gagnées`, value: `+${result.coinsEarned}`, inline: true },
    )
    .setTimestamp();

  if (result.itemDropped) {
    embed.addFields({ name: '🎁 Drop de Boss !', value: `${result.itemDropEmoji || '📦'} **${result.itemDropped}**` });
  }

  if (result.levelUp) {
    embed.addFields({ name: '🎉 NIVEAU SUPÉRIEUR !', value: `Vous passez au **Niveau ${result.levelUp}** !` });
  }

  await interaction.editReply({ embeds: [embed] });
}

async function rpgBossAutocomplete(interaction: AutocompleteInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const focused = interaction.options.getFocused().toLowerCase();
  const bosses = await listBosses(guildId);
  const filtered = bosses
    .filter(b => b.name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map(b => ({ name: `${b.emoji} ${b.name} (Niv. ${b.level})`, value: b.name }));
  await interaction.respond(filtered);
}

export const rpgBossCommand = { data: rpgBossData, execute: rpgBossExecute, autocomplete: rpgBossAutocomplete } satisfies SlashCommandDefinition;


// ============================================================================
// RPG-BESTIARY — Bestiaire des monstres découverts
// ============================================================================

const rpgBestiaryData = new SlashCommandBuilder()
  .setName('rpg-bestiary')
  .setDescription('📖 Consulter votre bestiaire de monstres découverts');

async function rpgBestiaryExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  await interaction.deferReply();

  const discovered = await listDiscoveredMonsters(guildId, userId);

  if (discovered.length === 0) {
    await interaction.editReply({ embeds: [errorEmbed('Bestiaire vide', 'Vous n\'avez encore vaincu aucun monstre. Utilisez `/rpg-fight` pour commencer !')] });
    return;
  }

  const allMonsters = await prisma.rpgMonster.count({
    where: { OR: [{ guildId: null }, { guildId }] }
  });

  const lines = discovered.map(m => {
    const bossTag = m.isBoss ? ' 👑 **BOSS**' : '';
    return `${m.emoji} **${m.name}**${bossTag} — Niv. ${m.level} | ❤️ ${m.health} | ⚔️ ${m.attack} | 🛡️ ${m.defense}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`📖 Bestiaire — ${interaction.user.displayName}`)
    .setDescription(`**${discovered.length}/${allMonsters}** créatures découvertes\n\n${lines.join('\n')}`)
    .setColor(COLORS.primary)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export const rpgBestiaryCommand = { data: rpgBestiaryData, execute: rpgBestiaryExecute } satisfies SlashCommandDefinition;


// ============================================================================
// FISH — Pêche
// ============================================================================

const fishData = new SlashCommandBuilder()
  .setName('fish')
  .setDescription('🎣 Pêcher un poisson et gagner des pièces');

async function fishExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;
  const guildId = interaction.guildId!;
  const userId = interaction.user.id;

  const config = await getOrCreateEconomyConfig(guildId);

  try {
    const result = await fish(guildId, userId);

    if (!result.success) {
      if (result.cooldown) {
        await interaction.reply({
          embeds: [errorEmbed('Canne au repos', `Vous devez attendre encore **${result.remainingMin}m ${result.remainingSec}s** avant de pêcher.`)],
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }
      if (result.noEnergy) {
        await interaction.reply({
          embeds: [errorEmbed('Pas d\'énergie', 'Il vous faut **5 énergie** pour pêcher.')],
          flags: [MessageFlags.Ephemeral]
        });
        return;
      }
      return;
    }

    const rarityLabels: Record<string, string> = {
      COMMON: 'Commun', UNCOMMON: 'Peu commun', RARE: 'Rare', EPIC: 'Épique', LEGENDARY: '✨ LÉGENDAIRE ✨'
    };

    const embed = new EmbedBuilder()
      .setTitle('🎣 Prise !')
      .setDescription(
        `${result.fish.emoji} Vous avez pêché un **${result.fish.name}** !\n\n` +
        `${result.rarityIcon} Rareté : **${rarityLabels[result.fish.rarity] || result.fish.rarity}**`
      )
      .setColor(
        result.fish.rarity === 'LEGENDARY' ? 0xffd700 :
        result.fish.rarity === 'EPIC' ? 0x9b59b6 :
        result.fish.rarity === 'RARE' ? 0x3498db :
        result.fish.rarity === 'UNCOMMON' ? 0x2ecc71 :
        COLORS.primary
      )
      .addFields(
        { name: `${config.currencyEmoji} Valeur`, value: `**+${result.fish.value}** ${config.currencyName}`, inline: true },
        { name: '⭐ XP', value: `**+${result.fish.xp}**`, inline: true },
        { name: '🐟 Total pêché', value: `${result.totalFishCaught} poissons`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Erreur lors de la pêche.';
    await interaction.reply({ embeds: [errorEmbed('Erreur', errMsg)], flags: [MessageFlags.Ephemeral] });
  }
}

export const fishCommand = { data: fishData, execute: fishExecute } satisfies SlashCommandDefinition;
