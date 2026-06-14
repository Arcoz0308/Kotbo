import type { SlashCommandDefinition } from '../../commands.js';
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
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
import {
  getOrCreateRpgProfile,
  claimDaily,
  startTravel,
  resolveTravel,
  chooseAdventureOutcome,
  buyShopItem,
  equipInventoryItem,
  consumePotionItem,
  createRpgGuild,
  joinRpgGuild,
  leaveRpgGuild,
  depositToRpgGuildTreasury,
  getOrCreateEconomyConfig,
  sellShopItem,
  adminSetStats
} from '../../services/features/economyService.js';

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
      embeds: [errorEmbed('Module Désactivé', 'Le système d\'économie et de RPG n\'est pas activé sur ce serveur.')],
      flags: [MessageFlags.Ephemeral]
    });
    return false;
  }
  return true;
}

// 1. RPG PROFILE COMMAND
const rpgProfileData = new SlashCommandBuilder()
  .setName('rpg-profile')
  .setDescription('🛡️ Consulter votre profil RPG et votre solde d\'économie')
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
  .setDescription('✈️ Démarrer ou résoudre un voyage d\'aventure');

async function rpgTravelExecute(interaction: ChatInputCommandInteraction) {
  if (!await checkEconomyEnabled(interaction)) return;

  const guildId = interaction.guildId!;
  const userId = interaction.user.id;
  const config = await getOrCreateEconomyConfig(guildId);

  if (!config.rpgEnabled) {
    await interaction.reply({
      embeds: [errorEmbed('RPG désactivé', 'Le système d\'aventures RPG est désactivé sur ce serveur.')],
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
        embeds: [successEmbed('Voyage terminé', 'Vous êtes bien arrivé à destination mais rien de particulier ne s\'est passé en chemin.')]
      });
      return;
    }

    const event = status.event!;
    const choices = event.choices as any[];

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
        await i.reply({ content: 'Ce n\'est pas votre aventure !', flags: [MessageFlags.Ephemeral] });
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
      } catch (err: any) {
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
    .setTitle('✈️ Commencer un voyage d\'aventure')
    .setDescription('Choisissez une destination ci-dessous. Voyager consomme **20 points d\'énergie** et prend un certain temps réel.\nÀ la fin de la durée, lancez à nouveau la commande pour faire face à un événement aléatoire !')
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
    } catch (err: any) {
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
    } catch (err: any) {
      await interaction.editReply({
        embeds: [errorEmbed('Achat échoué', err.message || 'Impossible d\'effectuer l\'achat.')],
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
    } catch (err: any) {
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
        embeds: [errorEmbed('Pas de guilde', 'Vous n\'appartenez à aucune guilde. Créez-en une avec `/rpg-guild create` ou rejoignez-en une avec `/rpg-guild join`.')],
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
    } catch (err: any) {
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
        embeds: [errorEmbed('Guilde introuvable', 'Aucune guilde avec ce nom n\'existe sur ce serveur.')],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    try {
      await joinRpgGuild(guildId, userId, targetGuild.id);
      await interaction.reply({
        embeds: [successEmbed('Bienvenue !', `Vous avez rejoint la guilde **${targetGuild.name}**.`)]
      });
    } catch (err: any) {
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
    } catch (err: any) {
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
    } catch (err: any) {
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
    await interaction.reply({ embeds: [errorEmbed('Erreur', 'Vous ne pouvez pas envoyer d\'argent à un bot !')], flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (receiver.id === senderId) {
    await interaction.reply({ embeds: [errorEmbed('Erreur', 'Vous ne pouvez pas vous envoyer d\'argent à vous-même !')], flags: [MessageFlags.Ephemeral] });
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
      .setDescription('Le nom de l\'objet à vendre')
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
    const errMsg = err instanceof Error ? err.message : 'Impossible de vendre l\'objet.';
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
  .setDescription('🎁 Faire tomber des KotboCoins ou de l\'XP RPG dans le salon')
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
  .setDescription('⚙️ Gérer le système RPG et d\'économie (Admin uniquement)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(sub =>
    sub
      .setName('set-balance')
      .setDescription('Modifier le solde d\'un joueur')
      .addUserOption(opt => opt.setName('membre').setDescription('Le membre cible').setRequired(true))
      .addIntegerOption(opt => opt.setName('solde').setDescription('Le nouveau solde').setRequired(true).setMinValue(0))
  )
  .addSubcommand(sub =>
    sub
      .setName('set-level')
      .setDescription('Modifier le niveau RPG d\'un joueur')
      .addUserOption(opt => opt.setName('membre').setDescription('Le membre cible').setRequired(true))
      .addIntegerOption(opt => opt.setName('niveau').setDescription('Le nouveau niveau').setRequired(true).setMinValue(1))
  )
  .addSubcommand(sub =>
    sub
      .setName('set-xp')
      .setDescription('Modifier les points d\'expérience RPG d\'un joueur')
      .addUserOption(opt => opt.setName('membre').setDescription('Le membre cible').setRequired(true))
      .addIntegerOption(opt => opt.setName('xp').setDescription('Le nouveau montant d\'XP').setRequired(true).setMinValue(0))
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
            { name: 'Configuration de l\'économie', value: 'config' },
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
      embeds: [errorEmbed('Erreur', 'Impossible de modifier les stats d\'un bot.')],
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
