import type { Recipe } from '@kotbo/shared';

/**
 * Recettes prêtes à l'emploi.
 *
 * Partir d'une page blanche est le moment où l'on abandonne : ces modèles
 * répondent aux besoins les plus courants et laissent volontairement les rôles
 * et salons vides. Les champs à compléter s'affichent alors en ambre, ce qui
 * transforme la mise en route en une liste de trous à combler plutôt qu'en
 * exercice de conception.
 */

export interface RecipeTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  build: () => Recipe;
}

export const RECIPE_TEMPLATES: RecipeTemplate[] = [
  {
    id: 'welcome',
    name: 'Message de bienvenue',
    description: 'Accueillir chaque arrivée dans un salon et lui donner son rôle de départ.',
    icon: 'User',
    build: () => ({
      trigger: { type: 'OnMemberJoin' },
      steps: [
        {
          id: 'welcome-message',
          kind: 'action',
          action: 'SendMessage',
          values: {
            text: { from: 'text', template: 'Bienvenue {member.displayName} sur {guild.name} !' },
            channel: { from: 'channel', channelId: '' },
          },
        },
        {
          id: 'welcome-role',
          kind: 'action',
          action: 'AddRole',
          values: {
            role: { from: 'role', roleId: '' },
            member: { from: 'context', path: 'member' },
          },
        },
      ],
    }),
  },
  {
    id: 'young-account',
    name: 'Surveiller les comptes récents',
    description: 'Signaler au staff les arrivées dont le compte Discord a moins d\'une semaine.',
    icon: 'Shield',
    build: () => ({
      trigger: { type: 'OnMemberJoin' },
      steps: [
        {
          id: 'young-check',
          kind: 'condition',
          match: 'all',
          tests: [
            { id: 'young-test', condition: 'member.accountAge', operator: 'lt', value: { from: 'number', value: 7 } },
          ],
          then: [
            {
              id: 'young-alert',
              kind: 'action',
              action: 'SendMessage',
              values: {
                text: { from: 'text', template: '⚠️ Compte récent : {member.tag} ({member.accountAgeDays} jours)' },
                channel: { from: 'channel', channelId: '' },
              },
            },
          ],
          otherwise: [],
        },
      ],
    }),
  },
  {
    id: 'anti-invite',
    name: 'Bloquer les invitations',
    description: 'Exclure temporairement qui poste un lien d\'invitation vers un autre serveur.',
    icon: 'AlertTriangle',
    build: () => ({
      trigger: { type: 'OnMessageSend' },
      steps: [
        {
          id: 'invite-check',
          kind: 'condition',
          match: 'all',
          tests: [
            { id: 'invite-test', condition: 'message.contains', value: { from: 'text', template: 'discord.gg' } },
          ],
          then: [
            {
              id: 'invite-timeout',
              kind: 'action',
              action: 'TimeoutMember',
              values: {
                member: { from: 'context', path: 'member' },
                minutes: { from: 'number', value: 10 },
                reason: { from: 'text', template: 'Lien d\'invitation non autorisé' },
              },
            },
          ],
          otherwise: [],
        },
      ],
    }),
  },
  {
    id: 'level-reward',
    name: 'Récompense de niveau',
    description: 'Féliciter publiquement un membre qui monte de niveau.',
    icon: 'Sparkles',
    build: () => ({
      trigger: { type: 'OnLevelUp' },
      steps: [
        {
          id: 'level-message',
          kind: 'action',
          action: 'SendMessage',
          values: {
            text: { from: 'text', template: '🎉 {member.displayName} passe niveau {level} !' },
            channel: { from: 'channel', channelId: '' },
          },
        },
      ],
    }),
  },
  {
    id: 'ticket-welcome',
    name: 'Accueil des tickets',
    description: 'Poster les consignes dès l\'ouverture d\'un ticket de support.',
    icon: 'TextBubble',
    build: () => ({
      trigger: { type: 'OnTicketCreated' },
      steps: [
        {
          id: 'ticket-message',
          kind: 'action',
          action: 'SendMessage',
          values: {
            text: {
              from: 'text',
              template: 'Bonjour {member.displayName}, décris ton problème en détail, un membre du staff arrive.',
            },
            channel: { from: 'context', path: 'channel' },
          },
        },
      ],
    }),
  },
];
