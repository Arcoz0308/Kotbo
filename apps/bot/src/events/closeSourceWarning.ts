import {
	type Client,
	EmbedBuilder,
	Events,
	type AnyThreadChannel,
	ChannelType,
} from 'discord.js';
import { logger } from '../utils/logger.js';

const FORUM_CHANNEL_ID = '1479636289450934476';
const CLOSE_SOURCE_TAG_ID = '1491865165006635149';

function hasCloseSourceTag(thread: AnyThreadChannel): boolean {
	return thread.appliedTags.includes(CLOSE_SOURCE_TAG_ID);
}

function buildCloseSourceWarningEmbed(): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(0xff4444)
		.setTitle('⚠️ Projet Close Source')
		.setDescription(
			[
				"**Ce projet est close source** : son code source n'est pas accessible publiquement.",
				'',
				'> 🔒 Nous **ne sommes pas responsables** du traitement de vos données ni de tout usage malveillant potentiel de ce logiciel.',
				'',
				"> 🛡️ **Soyez vigilants** : avant d'installer ou d'utiliser ce projet, assurez-vous de faire confiance à son auteur. Un logiciel dont le code n'est pas vérifiable peut présenter des risques pour votre vie privée et la sécurité de vos appareils.",
				'',
				"> 💡 En cas de doute, n'hésitez pas à demander des précisions à l'auteur du projet ou à un membre du staff.",
			].join('\n'),
		)
		.setFooter({ text: 'Vos données, votre responsabilité.' })
		.setTimestamp();
}

async function sendWarningIfNeeded(thread: AnyThreadChannel): Promise<void> {
	if (thread.parentId !== FORUM_CHANNEL_ID) return;
	if (!hasCloseSourceTag(thread)) return;

	try {
		await thread.send({ embeds: [buildCloseSourceWarningEmbed()] });
		logger.info(
			'CloseSource',
			`Avertissement close source envoyé dans le post "${thread.name}" (${thread.id})`,
		);
	} catch (error) {
		logger.error(
			'CloseSource',
			`Impossible d'envoyer l'avertissement dans le thread ${thread.id}:`,
			error,
		);
	}
}

export function registerCloseSourceWarningListener(client: Client): void {
	// Quand un nouveau post est créé dans le forum avec le tag close source
	client.on(Events.ThreadCreate, async (thread) => {
		if (thread.parentId !== FORUM_CHANNEL_ID) return;
		if (thread.type !== ChannelType.PublicThread) return;

		if (hasCloseSourceTag(thread)) {
			await sendWarningIfNeeded(thread);
		}
	});

	// Quand un post existant est modifié (ajout du tag close source)
	client.on(Events.ThreadUpdate, async (oldThread, newThread) => {
		if (newThread.parentId !== FORUM_CHANNEL_ID) return;

		const hadTag = oldThread.appliedTags.includes(CLOSE_SOURCE_TAG_ID);
		const hasTag = newThread.appliedTags.includes(CLOSE_SOURCE_TAG_ID);

		// Le tag vient d'être ajouté
		if (!hadTag && hasTag) {
			await sendWarningIfNeeded(newThread);
		}
	});

	logger.success('CloseSource', "Écouteur d'avertissement close source enregistré");
}
