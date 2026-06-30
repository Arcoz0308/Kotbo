/**
 * Kotbo — installation du widget dans le Profile Board Discord.
 *
 * À exécuter dans la console DevTools du Portail Développeur Discord :
 * https://discord.com/developers/applications
 *
 * Ce script utilise uniquement la session Discord du navigateur : il ne lit, ne copie
 * et ne transmet aucun token.
 */
(async function installKotboProfileWidget() {
  "use strict";

  const KOTBO_APPLICATION_ID = "1481651387317354598";
  const discordChunks = globalThis.webpackChunkdiscord_developers;

  if (!discordChunks) {
    throw new Error(
      "Ouvre https://discord.com/developers/applications dans ce navigateur, puis exécute le script dans la console de cet onglet.",
    );
  }

  const moduleCache = discordChunks.push([[Symbol()], {}, require => require.c]);
  discordChunks.pop();

  function findByProps(...properties) {
    for (const module of Object.values(moduleCache)) {
      try {
        if (!module.exports || module.exports === globalThis) continue;

        if (properties.every(property => module.exports?.[property])) {
          return module.exports;
        }

        for (const exported of Object.values(module.exports)) {
          if (
            exported &&
            exported[Symbol.toStringTag] !== "IntlMessagesProxy" &&
            properties.every(property => exported?.[property])
          ) {
            return exported;
          }
        }
      } catch {
        // Certains modules Discord utilisent des getters qui peuvent lever une exception.
      }
    }

    return null;
  }

  const api = findByProps("get", "put");
  const userStore = findByProps("getCurrentUser");

  if (!api || !userStore) {
    throw new Error("Modules du Portail Développeur introuvables. Recharge la page puis réessaie.");
  }

  const currentUser = userStore.getCurrentUser();
  if (!currentUser?.id) {
    throw new Error("Impossible de déterminer le compte Discord connecté.");
  }

  const profileResponse = await api.get({ url: `/users/${currentUser.id}/profile` });
  const widgets = Array.isArray(profileResponse?.body?.widgets)
    ? structuredClone(profileResponse.body.widgets)
    : [];

  const alreadyInstalled = widgets.some(widget =>
    widget?.data?.type === "application" &&
    String(widget?.data?.application_id) === KOTBO_APPLICATION_ID
  );

  if (alreadyInstalled) {
    console.info("%c✓ Le widget Kotbo est déjà installé.", "color:#22c55e;font-weight:700");
    return;
  }

  widgets.unshift({
    data: {
      type: "application",
      application_id: KOTBO_APPLICATION_ID,
    },
  });

  await api.put({
    url: "/users/@me/widgets",
    body: { widgets },
  });

  console.info(
    "%c✓ Widget Kotbo ajouté. Recharge Discord avec Ctrl+R.",
    "color:#22c55e;font-weight:700",
  );
})();
