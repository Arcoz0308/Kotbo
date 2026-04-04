import { MessageFlags, type AnySelectMenuInteraction, type ModalSubmitInteraction } from 'discord.js';

export async function requireSingleSelectedValue(
  interaction: AnySelectMenuInteraction,
  fieldLabel = 'sélection',
): Promise<string | null> {
  const value = interaction.values[0]?.trim();
  if (value) return value;

  await interaction.reply({
    content: `❌ Aucune ${fieldLabel} valide détectée.`,
    flags: [MessageFlags.Ephemeral],
  });
  return null;
}

export async function validateTimeField(
  interaction: ModalSubmitInteraction,
  time: string,
  example = '08:00',
): Promise<boolean> {
  if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
    return true;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate();
  }

  await interaction.followUp({
    content: `❌ Format d'heure invalide. Utilisez HH:MM (ex: ${example})`,
    flags: [MessageFlags.Ephemeral],
  });
  return false;
}

export function normalizeCommaKeywords(rawInput: string): string[] {
  return rawInput
    .split(',')
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length > 0);
}
