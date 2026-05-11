<script lang="ts">
  import { onMount } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import Papicon from '../Papicon.svelte';
  import ToggleSwitch from '../ToggleSwitch.svelte';
  import FormSelect from '../FormSelect.svelte';
  import InlineFeedback from '../InlineFeedback.svelte';
  import { createAsyncActionState } from '../../asyncAction.svelte';
  import { 
    updateFeatureConfiguration, 
    updateRoleAccess, 
    updateNotificationTargets,
    fetchFeatureConfigurations,
    fetchStaffRoles
  } from '../../api';
  import { dashboardStore } from '../../stores/dashboard.svelte';
  import type { StaffRole } from '../../types';

  let { show = false, onClose = () => {}, featureKey = '' } = $props();

  const saveAction = createAsyncActionState();
  let loading = $state(false);
  let feature = $state<any>(null);
  let staffRoles = $state<StaffRole[]>([]);
  let activeTab = $state('general');

  const availableChannels = $derived(dashboardStore.state.discordChannels || []);
  const availableRoles = $derived(dashboardStore.state.discordRoles || []);

  const tabs = [
    { id: 'general', label: 'Général', icon: 'Gear' },
    { id: 'discord', label: 'Discord', icon: 'Hash' },
    { id: 'access', label: 'Accès', icon: 'Shield' },
    { id: 'notifications', label: 'Notifications', icon: 'Bell' },
  ];

  const permissions = [
    { key: 'canView', label: 'Voir', icon: 'Eye' },
    { key: 'canModerate', label: 'Modérer', icon: 'Gavel' },
    { key: 'canConfigure', label: 'Configurer', icon: 'Settings' },
    { key: 'canDelete', label: 'Supprimer', icon: 'Trash' },
  ];

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const [featRes, rolesRes] = await Promise.all([
        fetchFeatureConfigurations(),
        fetchStaffRoles().catch(() => ({ roles: [] }))
      ]);
      
      if (featRes?.features) {
        feature = featRes.features.find((f: any) => f.featureKey === featureKey);
      }
      if (rolesRes?.roles) {
        staffRoles = rolesRes.roles;
      }
    } catch (err) {
      console.error('Failed to load feature settings:', err);
      saveAction.setError('Impossible de charger les réglages.');
    } finally {
      loading = false;
    }
  }

  async function handleSave() {
    if (!feature) return;
    await saveAction.run(async () => {
      const results = await Promise.all([
        updateFeatureConfiguration(featureKey, {
          enabled: feature.enabled,
          channelId: feature.channelId,
          secondaryChannelId: feature.secondaryChannelId,
          requiredRoleId: feature.requiredRoleId,
          notificationRoleId: feature.notificationRoleId,
          notifyViaDiscordChannel: feature.notifyViaDiscordChannel,
          notifyViaDM: feature.notifyViaDM,
          loggingEnabled: feature.loggingEnabled,
          userActivityTracking: feature.userActivityTracking
        }),
        updateRoleAccess(featureKey, feature.roleAccess),
        updateNotificationTargets(featureKey, feature.notificationTargets)
      ]);

      if (results.some(r => !r)) throw new Error('Erreur partielle lors de la sauvegarde');
      return true;
    }, { successMessage: 'Réglages enregistrés avec succès.' });
  }

  function getRoleAccess(level: number): any {
    if (!feature?.roleAccess) return {};
    return feature.roleAccess.find((ra: any) => ra.staffRoleLevel === level) || {};
  }

  function togglePermission(level: number, permKey: string) {
    if (!feature) return;
    if (!feature.roleAccess) feature.roleAccess = [];

    let ra = feature.roleAccess.find((r: any) => r.staffRoleLevel === level);
    if (!ra) {
      ra = { staffRoleLevel: level, canView: false, canModerate: false, canConfigure: false, canDelete: false };
      feature.roleAccess.push(ra);
    }
    ra[permKey] = !ra[permKey];
    feature = { ...feature };
  }

  function toggleNotificationTarget(id: string, type: 'ROLE' | 'USER') {
    if (!feature) return;
    if (!feature.notificationTargets) feature.notificationTargets = [];
    
    const idx = feature.notificationTargets.findIndex((t: any) => t.targetId === id && t.targetType === type);
    if (idx !== -1) {
      feature.notificationTargets.splice(idx, 1);
    } else {
      feature.notificationTargets.push({ targetId: id, targetType: type });
    }
    feature = { ...feature };
  }

  const roleLevels = $derived.by(() => {
    if (staffRoles.length > 0) {
      return [...staffRoles]
        .sort((a, b) => (a.sortOrder ?? a.level ?? 0) - (b.sortOrder ?? b.level ?? 0))
        .map((role, idx) => ({
          level: role.level ?? idx,
          name: role.name,
          color: ['text-blue-400', 'text-emerald-400', 'text-purple-400', 'text-amber-400', 'text-rose-400', 'text-cyan-400', 'text-teal-400', 'text-orange-400'][idx % 8],
          bg: ['bg-blue-500/10', 'bg-emerald-500/10', 'bg-purple-500/10', 'bg-amber-500/10', 'bg-rose-500/10', 'bg-cyan-500/10', 'bg-teal-500/10', 'bg-orange-500/10'][idx % 8],
          dotColor: ['bg-blue-400', 'bg-emerald-400', 'bg-purple-400', 'bg-amber-400', 'bg-rose-400', 'bg-cyan-400', 'bg-teal-400', 'bg-orange-400'][idx % 8],
        }));
    }
    return [];
  });

</script>

{#if show}
<div class="fixed inset-0 z-200 flex items-center justify-center p-4">
  <div 
    class="absolute inset-0 bg-black/60 backdrop-blur-sm" 
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="button"
    tabindex="-1"
    transition:fade={{ duration: 200 }}
  ></div>
  
  <div 
    class="relative w-full max-w-4xl bg-surface-container-lowest rounded-[2.5rem] shadow-2xl overflow-hidden border border-outline-variant/30 font-inter text-on-surface"
    transition:fly={{ y: 20, duration: 300 }}
  >
    <!-- Header -->
    <div class="p-8 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-low/50">
      <div class="flex items-center gap-5">
        <div class="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
          <Papicon icon="Gear" size={24} />
        </div>
        <div>
          <h2 class="text-xl font-black tracking-tight">Réglages : {feature?.featureName || featureKey}</h2>
          <p class="text-xs text-on-surface-variant/60 font-medium">Configurez les accès et notifications pour ce module.</p>
        </div>
      </div>
      <button 
        onclick={onClose}
        class="w-10 h-10 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors"
      >
        <Papicon icon="X" size={20} />
      </button>
    </div>

    <div class="flex h-150">
      <!-- Sidebar Nav -->
      <nav class="w-56 border-r border-outline-variant/10 bg-surface-container-low/20 p-4 space-y-1">
        {#each tabs as tab}
          <button
            onclick={() => activeTab = tab.id}
            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-left
              {activeTab === tab.id 
                ? 'bg-primary text-on-primary shadow-lg shadow-primary/20 font-bold' 
                : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'}"
          >
            <Papicon icon={tab.icon} size={18} />
            <span class="text-xs font-black uppercase tracking-widest">{tab.label}</span>
          </button>
        {/each}
      </nav>

      <!-- Content Area -->
      <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <InlineFeedback state={saveAction} />
        
        {#if loading}
          <div class="flex items-center justify-center h-full text-on-surface-variant/40 animate-pulse">
            <Papicon icon="Spinner" size={32} class="animate-spin" />
          </div>
        {:else if !feature}
          <div class="text-center py-20 space-y-4">
            <Papicon icon="Warning" size={48} class="text-amber-500 mx-auto opacity-20" />
            <p class="text-on-surface-variant/60 text-sm italic">Configuration introuvable pour ce module.</p>
          </div>
        {:else}
          <div class="space-y-8 animate-in fade-in duration-300">
            {#if activeTab === 'general'}
              <div class="space-y-6">
                <div class="flex items-center justify-between p-6 rounded-3xl bg-surface-container-low border border-outline-variant/10">
                  <div>
                    <h4 class="font-bold text-sm">Activer le module</h4>
                    <p class="text-[10px] text-on-surface-variant/60">Désactivez complètement cette fonctionnalité sur le bot.</p>
                  </div>
                  <ToggleSwitch checked={feature.enabled} onToggle={(v) => feature.enabled = v} />
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div class="p-5 rounded-2xl bg-surface-container-high/20 border border-outline-variant/10 space-y-3">
                    <div class="flex items-center justify-between">
                      <span class="text-[10px] font-black uppercase tracking-widest text-primary">Logs système</span>
                      <ToggleSwitch checked={feature.loggingEnabled} onToggle={(v) => feature.loggingEnabled = v} />
                    </div>
                    <p class="text-[10px] text-on-surface-variant/50">Enregistrer les actions importantes dans le journal de bord.</p>
                  </div>

                  <div class="p-5 rounded-2xl bg-surface-container-high/20 border border-outline-variant/10 space-y-3">
                    <div class="flex items-center justify-between">
                      <span class="text-[10px] font-black uppercase tracking-widest text-secondary">Suivi activité</span>
                      <ToggleSwitch checked={feature.userActivityTracking} onToggle={(v) => feature.userActivityTracking = v} />
                    </div>
                    <p class="text-[10px] text-on-surface-variant/50">Compter les interactions utilisateurs pour les statistiques.</p>
                  </div>
                </div>
              </div>

            {:else if activeTab === 'discord'}
              <div class="space-y-6">
                <div class="space-y-4">
                  <div class="space-y-1.5">
                    <label for="primaryChannel" class="text-[10px] font-bold text-on-surface-variant/60 ml-2">Salon principal</label>
                    <FormSelect id="primaryChannel" bind:value={feature.channelId} className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm">
                      <option value="">— Aucun —</option>
                      {#each availableChannels as c}<option value={c.id}>#{c.name}</option>{/each}
                    </FormSelect>
                  </div>
                  <div class="space-y-1.5">
                    <label for="requiredRole" class="text-[10px] font-bold text-on-surface-variant/60 ml-2">Rôle requis (Discord)</label>
                    <FormSelect id="requiredRole" bind:value={feature.requiredRoleId} className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm">
                      <option value="">— Aucun —</option>
                      {#each availableRoles as r}<option value={r.id}>@{r.name}</option>{/each}
                    </FormSelect>
                  </div>
                  <div class="space-y-1.5">
                    <label for="notificationRole" class="text-[10px] font-bold text-on-surface-variant/60 ml-2">Rôle de notification</label>
                    <FormSelect id="notificationRole" bind:value={feature.notificationRoleId} className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm">
                      <option value="">— Aucun —</option>
                      {#each availableRoles as r}<option value={r.id}>@{r.name}</option>{/each}
                    </FormSelect>
                  </div>
                </div>
              </div>

            {:else if activeTab === 'access'}
              <div class="space-y-4">
                <div class="overflow-hidden rounded-2xl border border-outline-variant/10">
                  <table class="w-full text-left border-collapse">
                    <thead class="bg-surface-container-high/40 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">
                      <tr>
                        <th class="px-4 py-3">Rôle Staff</th>
                        {#each permissions as perm}
                          <th class="px-2 py-3 text-center"><Papicon icon={perm.icon} size={12} /></th>
                        {/each}
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-outline-variant/5">
                      {#each roleLevels as role}
                        {@const ra = getRoleAccess(role.level)}
                        <tr class="hover:bg-surface-container-high/10">
                          <td class="px-4 py-3">
                            <span class="flex items-center gap-2 {role.color} font-bold text-xs">
                              <span class="w-1.5 h-1.5 rounded-full {role.dotColor}"></span>
                              {role.name}
                            </span>
                          </td>
                          {#each permissions as perm}
                            <td class="px-2 py-3 text-center">
                              <button
                                onclick={() => togglePermission(role.level, perm.key)}
                                class="w-6 h-6 rounded-lg flex items-center justify-center transition-all {ra[perm.key] ? 'bg-emerald-500/20 text-emerald-500' : 'bg-surface-container-high/40 text-on-surface-variant/20'}"
                              >
                                <Papicon icon={ra[perm.key] ? "Check" : "X"} size={10} />
                              </button>
                            </td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>

            {:else if activeTab === 'notifications'}
              <div class="space-y-6">
                <div class="grid grid-cols-2 gap-4">
                  <div class="p-4 rounded-2xl bg-surface-container-high/30 border border-outline-variant/10 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <Papicon icon="Hash" size={16} class="text-primary" />
                      <span class="text-xs font-bold">Discord</span>
                    </div>
                    <ToggleSwitch checked={feature.notifyViaDiscordChannel} onToggle={(v) => feature.notifyViaDiscordChannel = v} />
                  </div>
                  <div class="p-4 rounded-2xl bg-surface-container-high/30 border border-outline-variant/10 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <Papicon icon="User" size={16} class="text-secondary" />
                      <span class="text-xs font-bold">DMs</span>
                    </div>
                    <ToggleSwitch checked={feature.notifyViaDM} onToggle={(v) => feature.notifyViaDM = v} />
                  </div>
                </div>

                <div class="space-y-3">
                  <h5 class="text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40 ml-2">Cibles de notification</h5>
                  <div class="max-h-64 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                    {#each availableRoles.filter(r => r.id !== feature.notificationRoleId) as role}
                      {@const isTarget = feature.notificationTargets?.some((t: any) => t.targetId === role.id && t.targetType === 'ROLE')}
                      <button
                        onclick={() => toggleNotificationTarget(role.id, 'ROLE')}
                        class="w-full flex items-center justify-between p-3 rounded-xl border transition-all 
                          {isTarget ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-surface-container-high/20 border-outline-variant/5 text-on-surface-variant hover:border-outline-variant/20'}"
                      >
                        <span class="text-xs font-bold">@{role.name}</span>
                        <Papicon icon={isTarget ? "CheckCircle" : "Circle"} size={14} />
                      </button>
                    {/each}
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <!-- Footer -->
    <div class="p-6 border-t border-outline-variant/10 bg-surface-container-low/50 flex justify-end gap-4">
      <button 
        onclick={onClose}
        class="px-6 py-3 text-xs font-black uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors"
      >
        Annuler
      </button>
      <button 
        onclick={handleSave}
        disabled={saveAction.loading || !feature}
        class="px-8 py-3 bg-primary text-on-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
      >
        {#if saveAction.loading}
          Enregistrement...
        {:else}
          Enregistrer
        {/if}
      </button>
    </div>
  </div>
</div>
{/if}

<style>
  .custom-scrollbar::-webkit-scrollbar {
    width: 5px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(var(--color-outline-variant), 0.2);
    border-radius: 10px;
  }
</style>
