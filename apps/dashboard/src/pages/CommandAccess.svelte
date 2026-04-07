<script lang="ts">
  import { dashboardStore } from '../lib/stores/dashboard.svelte';
  import { updateCommandAccessSettings } from '../lib/api';
  import InlineFeedback from '../lib/components/InlineFeedback.svelte';
  import FormSelect from '../lib/components/FormSelect.svelte';
  import { refreshDashboardOnMount } from '../lib/dashboardLifecycle';
  import { createAsyncActionState } from '../lib/asyncAction.svelte';

  refreshDashboardOnMount();

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);
  const availableRoles = $derived(dashboardStore.state.discordRoles || []);
  const commandCatalog = $derived(dashboardStore.state.commandCatalog || []);
  const canManageSettings = $derived(!!dashboardStore.state.access?.canManageSettings);

  const saveAction = createAsyncActionState();

  let selectedCommandName = $state('');
  let commandDraft = $state({
    commandName: '',
    allowedChannelIds: [],
    blockedChannelIds: [],
    allowedRoleIds: [],
    blockedRoleIds: [],
  });

  const emptyDraft = () => ({
    commandName: '',
    allowedChannelIds: [],
    blockedChannelIds: [],
    allowedRoleIds: [],
    blockedRoleIds: [],
  });

  function loadCommandDraft(commandName: string) {
    const rule = dashboardStore.state.commandRestrictions.find((entry) => entry.commandName === commandName);
    commandDraft = rule ? {
      commandName: rule.commandName,
      allowedChannelIds: [...rule.allowedChannelIds],
      blockedChannelIds: [...rule.blockedChannelIds],
      allowedRoleIds: [...rule.allowedRoleIds],
      blockedRoleIds: [...rule.blockedRoleIds],
    } : {
      commandName,
      ...emptyDraft(),
    };
  }

  $effect(() => {
    if (!selectedCommandName && commandCatalog.length > 0) {
      selectedCommandName = commandCatalog[0].name;
      return;
    }
    if (selectedCommandName) {
      loadCommandDraft(selectedCommandName);
    }
  });

  function upsertCommandDraft() {
    if (!selectedCommandName) return;
    const nextRule = {
      commandName: selectedCommandName,
      allowedChannelIds: [...new Set(commandDraft.allowedChannelIds)],
      blockedChannelIds: [...new Set(commandDraft.blockedChannelIds)],
      allowedRoleIds: [...new Set(commandDraft.allowedRoleIds)],
      blockedRoleIds: [...new Set(commandDraft.blockedRoleIds)],
    };

    const nextRules = dashboardStore.state.commandRestrictions.filter((entry) => entry.commandName !== selectedCommandName);
    const hasAnyRestriction = nextRule.allowedChannelIds.length > 0
      || nextRule.blockedChannelIds.length > 0
      || nextRule.allowedRoleIds.length > 0
      || nextRule.blockedRoleIds.length > 0;

    dashboardStore.state.commandRestrictions = hasAnyRestriction ? [...nextRules, nextRule] : nextRules;
    commandDraft = { ...nextRule };
  }

  async function saveCommandAccess() {
    if (!canManageSettings) {
      saveAction.setError('Seuls les administrateurs peuvent modifier ces paramètres.');
      return;
    }

    upsertCommandDraft();

    await saveAction.run(
      async () => {
        const saved = await updateCommandAccessSettings(dashboardStore.state.commandRestrictions);
        if (!saved) return false;

        await dashboardStore.refresh();
        return true;
      },
      {
        successMessage: 'Restrictions de commande enregistrées.',
        failureMessage: 'Impossible d’enregistrer les restrictions pour le moment.'
      }
    );
  }

  function resetCommandDraft() {
    loadCommandDraft(selectedCommandName);
    saveAction.clearFeedback();
  }

  $effect(() => {
    if (selectedCommandName && !commandDraft.commandName) {
      loadCommandDraft(selectedCommandName);
    }
  });

  const selectedCatalogEntry = $derived(commandCatalog.find((entry) => entry.name === selectedCommandName));
  const selectedRestrictionSummary = $derived(
    dashboardStore.state.commandRestrictions.find((entry) => entry.commandName === selectedCommandName)
  );
</script>

<div class="mb-12 font-inter">
  <h2 class="text-4xl font-extrabold text-primary tracking-tight font-headline">Commandes & accès</h2>
  <p class="text-on-surface-variant mt-2 text-lg">Centralisez les salons et les rôles autorisés ou interdits pour chaque commande du bot.</p>
</div>

<div class="grid grid-cols-12 gap-8 font-inter">
  <div class="col-span-12 xl:col-span-4 space-y-6">
    <div class="bg-white dark:bg-slate-900 p-6 rounded-4xl shadow-sm border border-slate-100 dark:border-slate-800">
      <h3 class="text-xl font-bold font-headline flex items-center gap-3 mb-4">
        <span class="material-symbols-outlined text-primary">segment</span>
        Catalogue des commandes
      </h3>
      <div class="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
        {#each commandCatalog as command}
          <button
            type="button"
            onclick={() => { selectedCommandName = command.name; loadCommandDraft(command.name); }}
            class="w-full text-left p-4 rounded-2xl border transition-all duration-200 {selectedCommandName === command.name ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-white/5'}"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="font-black text-slate-800 dark:text-slate-100">/{command.name}</p>
                <p class="text-xs text-on-surface-variant mt-1">{command.label}</p>
              </div>
              <span class="text-[10px] font-black uppercase tracking-[0.18em] px-2 py-1 rounded-full {command.defaultAccess === 'administration' ? 'bg-rose-500/10 text-rose-600' : command.defaultAccess === 'modération' ? 'bg-amber-500/10 text-amber-700' : 'bg-emerald-500/10 text-emerald-700'}">
                {command.defaultAccess === 'administration' ? 'Admin' : command.defaultAccess === 'modération' ? 'Modération' : 'Ouvert'}
              </span>
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="col-span-12 xl:col-span-8 space-y-8">
    <div class="bg-white dark:bg-slate-900 p-8 rounded-4xl shadow-sm border border-slate-100 dark:border-slate-800">
      <div class="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <h3 class="text-2xl font-black font-headline">{selectedCatalogEntry ? `/${selectedCatalogEntry.name}` : 'Sélectionnez une commande'}</h3>
          <p class="text-on-surface-variant mt-1">{selectedCatalogEntry?.description || 'Choisissez une commande dans la colonne de gauche.'}</p>
        </div>
        <div class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-on-surface-variant">
          <span class="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800">{selectedRestrictionSummary ? 'Règles actives' : 'Aucune règle'}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-2">
          <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1" for="allowed-channels">Salons autorisés</label>
          <FormSelect
            id="allowed-channels"
            multiple
            bind:value={commandDraft.allowedChannelIds}
            disabled={!canManageSettings || !selectedCommandName}
            className="w-full min-h-44 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all font-bold"
          >
            {#each availableChannels as channel}
              <option value={channel.id}>#{channel.name}</option>
            {/each}
          </FormSelect>
          <p class="text-xs text-on-surface-variant">Si la liste est vide, ce critère ne s’applique pas.</p>
        </div>

        <div class="space-y-2">
          <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1" for="blocked-channels">Salons interdits</label>
          <FormSelect
            id="blocked-channels"
            multiple
            bind:value={commandDraft.blockedChannelIds}
            disabled={!canManageSettings || !selectedCommandName}
            className="w-full min-h-44 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all font-bold"
          >
            {#each availableChannels as channel}
              <option value={channel.id}>#{channel.name}</option>
            {/each}
          </FormSelect>
        </div>

        <div class="space-y-2">
          <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1" for="allowed-roles">Rôles autorisés</label>
          <FormSelect
            id="allowed-roles"
            multiple
            bind:value={commandDraft.allowedRoleIds}
            disabled={!canManageSettings || !selectedCommandName}
            className="w-full min-h-44 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all font-bold"
          >
            {#each availableRoles as role}
              <option value={role.id}>@{role.name}</option>
            {/each}
          </FormSelect>
          <p class="text-xs text-on-surface-variant">Un seul rôle correspondant suffit pour autoriser la commande.</p>
        </div>

        <div class="space-y-2">
          <label class="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest ml-1" for="blocked-roles">Rôles interdits</label>
          <FormSelect
            id="blocked-roles"
            multiple
            bind:value={commandDraft.blockedRoleIds}
            disabled={!canManageSettings || !selectedCommandName}
            className="w-full min-h-44 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all font-bold"
          >
            {#each availableRoles as role}
              <option value={role.id}>@{role.name}</option>
            {/each}
          </FormSelect>
        </div>
      </div>

      <div class="mt-8 p-4 rounded-3xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-sm text-on-surface-variant">
        <p class="font-bold text-on-surface mb-2">Récapitulatif</p>
        <p>Salons autorisés : {commandDraft.allowedChannelIds.length || 'aucun'} · Salons interdits : {commandDraft.blockedChannelIds.length || 'aucun'} · Rôles autorisés : {commandDraft.allowedRoleIds.length || 'aucun'} · Rôles interdits : {commandDraft.blockedRoleIds.length || 'aucun'}</p>
      </div>

      <div class="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800 pt-6">
        <InlineFeedback
          message={saveAction.state.message}
          error={saveAction.state.error}
          idleText="Les modifications ne sont appliquées qu’après enregistrement."
        />
        <div class="flex items-center gap-3">
          <button
            type="button"
            onclick={resetCommandDraft}
            disabled={!canManageSettings || !selectedCommandName}
            class="px-4 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-black uppercase tracking-wider text-on-surface-variant hover:bg-surface-container-low"
          >
            Réinitialiser
          </button>
          <button
            type="button"
            onclick={saveCommandAccess}
            disabled={saveAction.state.loading || !canManageSettings || !selectedCommandName}
            class="px-5 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider shadow-lg shadow-primary/10 hover:opacity-90 disabled:opacity-50"
          >
            {saveAction.state.loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  </div>
</div>