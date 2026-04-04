import {
  BaseInteraction,
  MessageFlags,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
  type MessageCreateOptions,
  type TextChannel,
} from 'discord.js';

type RepliableInteractionLike = {
  deferred?: boolean;
  replied?: boolean;
  isRepliable: () => boolean;
  followUp: (options: InteractionReplyOptions) => Promise<unknown>;
  reply: (options: InteractionReplyOptions) => Promise<unknown>;
};

function canUpdateInteraction(value: unknown): value is { update: (options: InteractionUpdateOptions) => Promise<unknown> } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { update?: unknown };
  return typeof candidate.update === 'function';
}

function toEditReplyOptions(payload: InteractionReplyOptions): InteractionEditReplyOptions {
  return {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
    allowedMentions: payload.allowedMentions,
  };
}

function toUpdateOptions(payload: InteractionReplyOptions): InteractionUpdateOptions {
  return {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
    allowedMentions: payload.allowedMentions,
  };
}

function toChannelMessageOptions(payload: InteractionReplyOptions): MessageCreateOptions {
  return {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
    allowedMentions: payload.allowedMentions,
  };
}

export async function replyOrFollowUp(
  interaction: RepliableInteractionLike,
  payload: InteractionReplyOptions,
): Promise<void> {
  if (!interaction.isRepliable()) return;

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
    return;
  }

  await interaction.reply(payload);
}

export async function acknowledgeInteraction(
  interaction: BaseInteraction,
  flags: InteractionReplyOptions['flags'] = [MessageFlags.Ephemeral],
): Promise<void> {
  if (!interaction.isRepliable() || interaction.deferred || interaction.replied) return;

  const candidate = interaction as unknown as { deferUpdate?: () => Promise<void>; deferReply?: (options: InteractionReplyOptions) => Promise<void> };

  if (typeof candidate.deferUpdate === 'function' && interaction.isMessageComponent()) {
    await candidate.deferUpdate();
    return;
  }

  if (typeof candidate.deferReply === 'function') {
    await candidate.deferReply({ flags });
  }
}

export async function renderPanelTarget(
  target: TextChannel | BaseInteraction,
  payload: InteractionReplyOptions,
): Promise<void> {
  if (!(target instanceof BaseInteraction)) {
    await target.send(toChannelMessageOptions(payload));
    return;
  }

  if (!target.isRepliable()) return;

  if (target.deferred || target.replied) {
    await target.editReply(toEditReplyOptions(payload));
    return;
  }

  if (target.isMessageComponent()) {
    await target.update(toUpdateOptions(payload));
    return;
  }

  if (target.isModalSubmit() && canUpdateInteraction(target)) {
    await target.update(toUpdateOptions(payload));
    return;
  }

  await target.reply({
    ...payload,
    flags: payload.flags ?? [MessageFlags.Ephemeral],
  });
}
