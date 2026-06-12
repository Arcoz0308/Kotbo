import { Message } from 'discord.js';
import prisma from '../../utils/db.js';

/**
 * Gets or creates the Fun Game State for a guild.
 */
export async function getOrCreateFunGameState(guildId: string) {
  let state = await prisma.funGameState.findUnique({
    where: { guildId }
  });

  if (!state) {
    state = await prisma.funGameState.create({
      data: {
        guildId,
        countingCurrent: 0,
        countingLastUserId: null,
        oneWordStoryLastUserId: null,
        guessNumberTarget: Math.floor(Math.random() * 1000) + 1
      }
    });
  }

  return state;
}

/**
 * Resets the counting game.
 */
export async function resetCounting(guildId: string) {
  return prisma.funGameState.upsert({
    where: { guildId },
    create: {
      guildId,
      countingCurrent: 0,
      countingLastUserId: null,
      guessNumberTarget: Math.floor(Math.random() * 1000) + 1
    },
    update: {
      countingCurrent: 0,
      countingLastUserId: null
    }
  });
}

/**
 * Resets the guess the number game with a new target.
 */
export async function resetGuessNumber(guildId: string) {
  const newTarget = Math.floor(Math.random() * 1000) + 1;
  return prisma.funGameState.upsert({
    where: { guildId },
    create: {
      guildId,
      countingCurrent: 0,
      guessNumberTarget: newTarget
    },
    update: {
      guessNumberTarget: newTarget
    }
  });
}

/**
 * Handles messages in the Counting channel.
 */
export async function handleCountingMessage(message: Message, guildId: string) {
  const content = message.content.trim();
  
  // Only process if the message is exactly a number
  if (!/^\d+$/.test(content)) {
    return;
  }

  const num = parseInt(content, 10);
  const gameState = await getOrCreateFunGameState(guildId);
  const nextNumber = gameState.countingCurrent + 1;

  // Rule 1: Incorrect number resets the game
  if (num !== nextNumber) {
    await resetCounting(guildId);
    await message.react('❌').catch(() => null);
    await message.reply(`❌ **Chiffre incorrect !** ${message.author} a ruiné le comptage à **${gameState.countingCurrent}**. On recommence à 0 !`).catch(() => null);
    return;
  }

  // Rule 2: Same user cannot count twice in a row
  if (gameState.countingLastUserId === message.author.id) {
    await resetCounting(guildId);
    await message.react('❌').catch(() => null);
    await message.reply(`❌ **Double comptage !** Vous ne pouvez pas compter deux fois de suite. Le comptage est réinitialisé à 0 !`).catch(() => null);
    return;
  }

  // Correct count! Update state
  await prisma.funGameState.update({
    where: { guildId },
    data: {
      countingCurrent: nextNumber,
      countingLastUserId: message.author.id
    }
  });

  await message.react('✅').catch(() => null);

  // Celebratory milestones
  if (nextNumber % 100 === 0) {
    await message.react('🎉').catch(() => null);
    await message.react('💯').catch(() => null);
    await message.channel.send(`🎉 **Palier exceptionnel !** Nous avons atteint **${nextNumber}** ! Bravo à tous ! 👑`).catch(() => null);
  } else if (nextNumber % 10 === 0) {
    await message.react('⭐').catch(() => null);
  }
}

/**
 * Handles messages in the One Word Story channel.
 */
export async function handleOneWordStoryMessage(message: Message, guildId: string) {
  const content = message.content.trim();
  
  if (!content) return;

  const wordCount = content.split(/\s+/).filter(Boolean).length;
  const gameState = await getOrCreateFunGameState(guildId);

  // Validate: exactly one word AND user is not the same as the last one
  const isInvalid = wordCount !== 1 || gameState.oneWordStoryLastUserId === message.author.id;

  if (isInvalid) {
    await message.delete().catch(() => null);
    const warnMsg = await message.channel.send(`❌ ${message.author}, un seul mot à la fois et vous ne pouvez pas jouer deux fois de suite !`).catch(() => null);
    if (warnMsg) {
      setTimeout(() => {
        warnMsg.delete().catch(() => null);
      }, 3000);
    }
    return;
  }

  // Valid word! Update last user
  await prisma.funGameState.update({
    where: { guildId },
    data: {
      oneWordStoryLastUserId: message.author.id
    }
  });
}

/**
 * Handles messages in the Guess the Number channel.
 */
export async function handleGuessNumberMessage(message: Message, guildId: string) {
  const content = message.content.trim();
  
  if (!/^\d+$/.test(content)) {
    return;
  }

  const guess = parseInt(content, 10);
  const gameState = await getOrCreateFunGameState(guildId);
  const target = gameState.guessNumberTarget;

  if (guess < target) {
    await message.react('⬆️').catch(() => null);
  } else if (guess > target) {
    await message.react('⬇️').catch(() => null);
  } else {
    // Winner! Generate new target
    const newTarget = Math.floor(Math.random() * 1000) + 1;
    await prisma.funGameState.update({
      where: { guildId },
      data: {
        guessNumberTarget: newTarget
      }
    });

    await message.react('🎉').catch(() => null);
    await message.reply(`🎉 **Félicitations ${message.author} !** Tu as deviné le nombre mystère qui était **${target}** ! Un nouveau nombre mystère a été généré (entre 1 et 1000).`).catch(() => null);
  }
}
