# Dépistage AIPD

## Critères présents

- surveillance régulière de l'activité textuelle et vocale ;
- évaluation ou classement de membres et de staff ;
- association automatisée ou manuelle de comptes ;
- décisions de modération pouvant limiter l'accès à une communauté ;
- utilisateurs potentiellement mineurs ;
- combinaison de plusieurs sources Discord, formulaires et journaux.

Plusieurs critères pouvant être réunis, une AIPD complète est recommandée pour les modules d'analytics comportementales, de détection de comptes liés et de gestion approfondie du staff. Kotbo doit fournir aux responsables de serveur les informations techniques nécessaires.

## Mesures déjà prévues

- isolation par guilde et permissions granulaires ;
- profils privés par défaut ;
- OAuth Authorization Code, session opaque et cookie HttpOnly ;
- chiffrement des jetons Discord dans Redis ;
- notices avant OAuth, vérification et formulaires ;
- suppression des appels Google Fonts et `ui-avatars.com`.

## Travaux restant à traiter séparément

- vérification exhaustive des durées et purges ;
- suppression complète lors du retrait d'une guilde ;
- mesure documentée des faux positifs de détection ;
- procédure de contestation des décisions assistées par détection ;
- validation des risques résiduels par chaque responsable de traitement.
