import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import {
  closeAbsence,
  createAbsence,
  getAbsenceById,
  getLatestOpenAbsenceForMember,
} from '../../services/staff/staffLeadershipService.js';
import { getStaffMember } from '../../services/staff/staffManagementService.js';
import { successContainer, errorContainer, v2 } from '../../utils/embeds.js';
import { E } from '../../utils/emojis.js';
import type { SlashCommandDefinition } from '../../commands.js';

const data = new SlashCommandBuilder()
  .setName('absent')
  .setDescription('Gère vos absences staff (déclaration et clôture).')
  .addSubcommand((subcommand) =>
    subcommand
      .setName('declarer')
      .setDescription('Déclare une absence staff.')
      .addStringOption((option) =>
        option
          .setName('type')
          .setDescription("Type d'absence")
          .setRequired(true)
          .addChoices(
            { name: 'Congé', value: 'Conge' },
            { name: 'Maladie', value: 'Maladie' },
            { name: 'Personnel', value: 'Personnel' },
            { name: 'Autre', value: 'Autre' },
          ),
      )
      .addStringOption((option) =>
        option
          .setName('debut')
          .setDescription('Date de début (YYYY-MM-DD)')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('raison')
          .setDescription("Motif de l'absence")
          .setRequired(true),
      )
      .addUserOption((option) =>
        option
          .setName('superieur')
          .setDescription('Supérieur à notifier')
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName('fin')
          .setDescription('Date de fin (YYYY-MM-DD, optionnelle)')
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName('message')
          .setDescription('Message complémentaire (optionnel)')
          .setRequired(false),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('terminer')
      .setDescription('Clôture une absence active (vous-même ou en tant que supérieur).')
      .addStringOption((option) =>
        option
          .setName('absence_id')
          .setDescription("ID de l'absence à clôturer (optionnel)")
          .setRequired(false),
      )
      .addUserOption((option) =>
        option
          .setName('staff')
          .setDescription('Staff concerné (optionnel)')
          .setRequired(false),
      )
      .addStringOption((option) =>
        option
          .setName('note')
          .setDescription('Note de clôture (optionnelle)')
          .setRequired(false),
      ),
  );

const parseDateInput = (value: string): Date | null => {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const askIndefiniteConfirmation = async (
  interaction: ChatInputCommandInteraction,
): Promise<ModalSubmitInteraction | null> => {
  const modalCustomId = `absence-indeterminee-${interaction.id}`;
  const modal = new ModalBuilder()
    .setCustomId(modalCustomId)
    .setTitle('Confirmation absence indéterminée');

  const confirmationInput = new TextInputBuilder()
    .setCustomId('confirmation')
    .setLabel('Tapez INDETERMINE pour confirmer')
    .setPlaceholder('INDETERMINE')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(11)
    .setMaxLength(11);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(confirmationInput));
  await interaction.showModal(modal);

  try {
    const submit = await interaction.awaitModalSubmit({
      time: 90_000,
      filter: (modalInteraction) => modalInteraction.customId === modalCustomId && modalInteraction.user.id === interaction.user.id,
    });

    const value = submit.fields.getTextInputValue('confirmation').trim().toUpperCase();
    if (value !== 'INDETERMINE') {
      await submit.reply({
        ...v2(errorContainer('Confirmation invalide', "La déclaration d'absence a été annulée.")),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return null;
    }

    await submit.deferReply({ flags: [MessageFlags.Ephemeral] });
    return submit;
  } catch {
    await interaction.followUp({
      ...v2(errorContainer('Confirmation expirée', 'Relancez `/absent declarer` si besoin.')),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return null;
  }
};

async function execute(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) return;

  const staff = await getStaffMember(interaction.guildId, interaction.user.id);
  if (!staff) {
    await interaction.reply({
      ...v2(errorContainer('Accès refusé', "Vous ne faites pas partie de l'équipe Staff.")),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'declarer') {
    const type = interaction.options.getString('type', true);
    const debutRaw = interaction.options.getString('debut', true);
    const finRaw = interaction.options.getString('fin', false);
    const reason = interaction.options.getString('raison', true);
    const message = interaction.options.getString('message', false) ?? undefined;
    const superior = interaction.options.getUser('superieur', true);

    if (superior.bot) {
      await interaction.reply({
        ...v2(errorContainer('Supérieur invalide', 'Le supérieur indiqué doit être un membre humain.')),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const superiorStaff = await getStaffMember(interaction.guildId, superior.id);
    if (!superiorStaff) {
      await interaction.reply({
        ...v2(errorContainer('Supérieur invalide', 'Le supérieur indiqué ne fait pas partie du staff.')),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const startDate = parseDateInput(debutRaw);
    const endDate = finRaw ? parseDateInput(finRaw) : null;

    if (!startDate || (finRaw && !endDate)) {
      await interaction.reply({
        ...v2(errorContainer('Format invalide', 'Format de date invalide. Utilisez YYYY-MM-DD.')),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    if (endDate && endDate < startDate) {
      await interaction.reply({
        ...v2(errorContainer('Dates incohérentes', 'La date de fin doit être postérieure ou égale à la date de début.')),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    let replyInteraction: ChatInputCommandInteraction | ModalSubmitInteraction = interaction;

    if (!endDate) {
      const confirmedModal = await askIndefiniteConfirmation(interaction);
      if (!confirmedModal) {
        return;
      }
      replyInteraction = confirmedModal;
    } else {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    }

    try {
      const absence = await createAbsence({
        guildId: interaction.guildId,
        staffMemberId: staff.id,
        startDate,
        endDate: endDate ?? undefined,
        reason,
        type,
        message,
        superiorUserId: superior.id,
      });

      const isIndefinite = !endDate;
      await replyInteraction.editReply(
        v2(successContainer(
          'Absence déclarée',
          isIndefinite
            ? `Absence déclarée en **indéterminé**. Supérieur notifié: <@${superior.id}>. ID: \`${absence.id}\`.`
            : `Absence déclarée du **${debutRaw}** au **${finRaw}**. Supérieur notifié: <@${superior.id}>. ID: \`${absence.id}\`.`,
        )),
      );

      try {
        await superior.send(
          `${E.news} Nouvelle absence staff\n${E.arrow} Staff: ${interaction.user.tag} (${interaction.user.id})\n${E.arrow} Type: ${type}\n${E.arrow} Début: ${debutRaw}\n${E.arrow} Fin: ${finRaw ?? 'Indéterminée'}\n${E.arrow} Motif: ${reason}${message ? `\n${E.arrow} Message: ${message}` : ''}\n${E.arrow} ID: ${absence.id}`,
        );
      } catch {
        // Le DM peut échouer selon les préférences utilisateur, ce n'est pas bloquant.
      }
    } catch (err) {
      await replyInteraction.editReply(
        v2(errorContainer('Erreur', err instanceof Error ? err.message : 'Une erreur est survenue lors de la création de l\'absence.')),
      );
    }
    return;
  }

  if (subcommand === 'terminer') {
    const absenceId = interaction.options.getString('absence_id', false);
    const targetUser = interaction.options.getUser('staff', false) ?? interaction.user;
    const closeNote = interaction.options.getString('note', false) ?? undefined;

    const targetStaff = await getStaffMember(interaction.guildId, targetUser.id);
    if (!targetStaff) {
      await interaction.reply({
        ...v2(errorContainer('Membre introuvable', 'Le membre ciblé ne fait pas partie du staff.')),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const absence = absenceId
      ? await getAbsenceById(interaction.guildId, absenceId)
      : await getLatestOpenAbsenceForMember(interaction.guildId, targetStaff.id);

    if (!absence) {
      await interaction.reply({
        ...v2(errorContainer('Aucune absence', 'Aucune absence active trouvée à clôturer.')),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    const isTargetStaff = absence.staffMember.userId === interaction.user.id;
    const isAssignedSuperior = absence.superiorUserId === interaction.user.id;

    if (!isTargetStaff && !isAssignedSuperior) {
      await interaction.reply({
        ...v2(errorContainer('Permission refusée', "Vous ne pouvez clôturer que votre absence ou celle d'un staff dont vous êtes le supérieur notifié.")),
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      return;
    }

    await closeAbsence(absence.id, interaction.user.id, closeNote);

    await interaction.reply({
      ...v2(successContainer('Absence clôturée', `Absence clôturée pour <@${absence.staffMember.userId}> (ID: \`${absence.id}\`).`)),
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  }
}

export const absentCommand: SlashCommandDefinition = { data, execute } satisfies SlashCommandDefinition;
