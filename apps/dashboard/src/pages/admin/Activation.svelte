<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from '../../lib/stores/toast.svelte';
  import { fetchActivationCodes, createActivationCode, deleteActivationCode, fetchAdminGuilds, deactivateAdminGuild, activateAdminGuildAuto } from '../../lib/api';
  import Papicon from '../../lib/components/Papicon.svelte';
  import AdminLayout from '../../lib/components/AdminLayout.svelte';

  interface ActivationCode {
    id: string;
    code: string;
    isActive: boolean;
    usedByGuildId: string | null;
    guildName: string | null;
  }

  let activationCodes = $state<ActivationCode[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  async function loadActivationCodes() {
    try {
      activationCodes = await fetchActivationCodes();
    } catch (err: any) {
      console.error('Erreur chargement codes activation:', err);
    }
  }

  onMount(async () => {
    try {
      await loadActivationCodes();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  });

  async function handleGenerateCode() {
    try {
      const newCode = await createActivationCode();
      toast.success(`Nouveau code généré : ${newCode.code}`);
      await loadActivationCodes();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDeleteCode(codeId: string, code: string, usedBy: string | null) {
    const warning = usedBy 
      ? `ATTENTION: Ce code est utilisé par le serveur "${usedBy}". Supprimer ce code désactivera immédiatement ce serveur ! Continuer ?`
      : `Voulez-vous vraiment supprimer le code d'activation ${code} ?`;
    if (!confirm(warning)) return;
    try {
      await deleteActivationCode(codeId);
      toast.success("Code d'activation supprimé.");
      await loadActivationCodes();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleActivateGuildAuto(guildId: string, guildName: string) {
    if (!confirm(`Voulez-vous vraiment activer automatiquement le serveur "${guildName}" avec un nouveau code généré ?`)) return;
    try {
      const res = await activateAdminGuildAuto(guildId);
      toast.success(`Serveur activé ! Code généré : ${res.code}`);
      
      const guildsData = await fetchAdminGuilds();
      await loadActivationCodes();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDeactivateGuild(guildId: string, guildName: string) {
    if (!confirm(`Voulez-vous vraiment désactiver le serveur "${guildName}" ? Ses fonctionnalités et son dashboard seront immédiatement verrouillés.`)) return;
    try {
      await deactivateAdminGuild(guildId);
      toast.success("Serveur désactivé avec succès.");
      
      const guildsData = await fetchAdminGuilds();
      await loadActivationCodes();
    } catch (err: any) {
      toast.error(err.message);
    }
  }
</script>

<AdminLayout>
  <div class="space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-3 duration-600">
  <!-- Header -->
  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-container-low/40 p-5 rounded-xl border border-outline-variant/30">
    <div>
      <h2 class="text-lg font-semibold text-on-surface tracking-tight">Codes d'activation</h2>
      <p class="text-sm text-on-surface-variant/50 font-medium">Gestion des jetons d'activation pour les serveurs</p>
    </div>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="premium-card rounded-[2.25rem] p-8 space-y-6 h-full">
        <div class="animate-pulse space-y-4">
          <div class="h-20 bg-surface/40 rounded-lg"></div>
          <div class="h-20 bg-surface/40 rounded-lg"></div>
          <div class="h-12 bg-surface/40 rounded-xl"></div>
        </div>
      </div>
      <div class="lg:col-span-2 premium-card rounded-[2.25rem] overflow-hidden">
        <div class="animate-pulse space-y-4 p-8">
          <div class="h-12 bg-surface/40 rounded-xl"></div>
          <div class="h-12 bg-surface/40 rounded-xl"></div>
          <div class="h-12 bg-surface/40 rounded-xl"></div>
        </div>
      </div>
    </div>
  {:else if error}
    <div class="bg-error/10 border border-error/20 p-8 rounded-[2.25rem] text-center">
      <Papicon icon="AlertTriangle" size={48} class="text-error mx-auto mb-4" />
      <h2 class="text-xl font-bold text-on-error-container">Erreur de chargement</h2>
      <p class="text-on-error-container/70 mt-2">{error}</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in">
      <!-- Generation Sidebar -->
      <div class="lg:col-span-1 space-y-6">
        <h2 class="text-xl font-semibold font-headline flex items-center gap-3 px-2">
          <Papicon icon="Lock" size={24} class="text-indigo-400" />
          Générateur
        </h2>
        
        <div class="premium-card rounded-[2.25rem] p-8 space-y-6 flex flex-col justify-between">
          <div class="space-y-4">
            <p class="text-sm text-on-surface-variant leading-relaxed">
              Générez un nouveau code d'activation aléatoire unique. Ce code pourra être utilisé par les administrateurs de serveurs Discord pour activer le bot et débloquer leur accès au tableau de bord.
            </p>
            <div class="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 font-bold flex items-start gap-3">
              <Papicon icon="AlertTriangle" size={18} class="shrink-0 mt-0.5" />
              <span>Chaque code ne peut être utilisé que pour un seul serveur Discord à la fois.</span>
            </div>
          </div>

          <button 
            onclick={handleGenerateCode}
            class="w-full py-4 rounded-xl bg-primary text-on-primary font-semibold uppercase tracking-widest text-xs transition-all hover: active:scale-95  flex items-center justify-center gap-3"
          >
            <Papicon icon="Unlock" size={16} />
            Générer un code
          </button>
        </div>
      </div>

      <!-- Codes List Table -->
      <div class="lg:col-span-2 space-y-6">
        <h2 class="text-xl font-semibold font-headline flex items-center gap-3 px-2">
          <Papicon icon="activity" size={24} class="text-purple-400" />
          Jetons d'activation ({activationCodes.length})
        </h2>

        <div class="premium-card rounded-[2.25rem] overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse border-spacing-0">
              <thead class="bg-on-surface/5 text-on-surface-variant/40 text-[10px] font-semibold uppercase tracking-widest">
                <tr>
                  <th class="px-8 py-5">Code d'activation</th>
                  <th class="px-8 py-5">Statut</th>
                  <th class="px-8 py-5">Utilisé par</th>
                  <th class="px-8 py-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-outline-variant/10">
                {#each activationCodes as item}
                  <tr class="hover:bg-on-surface/5 transition-colors group">
                    <td class="px-8 py-5">
                      <span class="font-mono text-sm font-semibold text-on-surface bg-surface-container-high px-3 py-1.5 rounded-lg border border-outline-variant/20 tracking-wider">
                        {item.code}
                      </span>
                    </td>
                    <td class="px-8 py-5">
                      {#if item.isActive}
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-success/10 text-success border border-success/20">
                          <span class="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                          Disponible
                        </span>
                      {:else}
                        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                          <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Utilisé
                        </span>
                      {/if}
                    </td>
                    <td class="px-8 py-5 text-sm">
                      {#if item.usedByGuildId}
                        <div>
                          <p class="font-bold text-on-surface">{item.guildName || 'Serveur Actif'}</p>
                          <p class="text-[10px] text-on-surface-variant/40 font-mono tracking-tighter mt-0.5">{item.usedByGuildId}</p>
                        </div>
                      {:else}
                        <span class="text-xs text-on-surface-variant/40 italic">Aucun serveur</span>
                      {/if}
                    </td>
                    <td class="px-8 py-5 text-right">
                        <button 
                        class="w-10 h-10 inline-flex items-center justify-center hover:bg-error/10 rounded-xl text-on-surface-variant hover:text-error transition-all group-"
                        onclick={() => handleDeleteCode(item.id, item.code, item.guildName)}
                        title={item.usedByGuildId ? "Révoquer et désactiver le serveur" : "Supprimer ce code"}
                      >
                        <Papicon icon="Trash" size={18} />
                      </button>
                    </td>
                  </tr>
                {/each}
                {#if activationCodes.length === 0}
                  <tr>
                    <td colspan="4" class="px-8 py-10 text-center text-on-surface-variant/40 italic text-sm">
                      Aucun code d'activation généré pour le moment.
                    </td>
                  </tr>
                {/if}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  {/if}
  </div>
</AdminLayout>
