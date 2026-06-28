<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchQuestsData, createQuest, updateQuest, deleteQuest } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  let loading = $state(true);
  let data: any = $state(null);
  let showCreate = $state(false);
  let showTemplates = $state(false);
  let newQuest = $state({
    name: '', description: '', type: 'SEND_MESSAGES', frequency: 'DAILY',
    target: 10, rewardCoins: 50, rewardXp: 25
  });

  const questTypes: Record<string, string> = {
    SEND_MESSAGES: 'Envoyer des messages',
    VOICE_MINUTES: 'Minutes en vocal',
    REACT_MESSAGES: 'Réagir à des messages',
    WIN_GAME: 'Gagner un jeu',
    EARN_COINS: 'Gagner des coins',
    GIVE_REP: 'Donner des +rep',
    CREATE_THREADS: 'Créer des threads',
    REPLY_MESSAGES: 'Répondre à des messages',
  };

  const questTemplates = [
    { name: 'Bavard du jour', type: 'SEND_MESSAGES', target: 50, rewardCoins: 100, rewardXp: 50, frequency: 'DAILY', description: 'Envoyez 50 messages aujourd\'hui', icon: 'chat', color: 'var(--color-primary)' },
    { name: 'Vocaliste', type: 'VOICE_MINUTES', target: 30, rewardCoins: 75, rewardXp: 40, frequency: 'DAILY', description: 'Passez 30 minutes en vocal', icon: 'mic', color: 'var(--color-success)' },
    { name: 'Réacteur', type: 'REACT_MESSAGES', target: 20, rewardCoins: 50, rewardXp: 25, frequency: 'DAILY', description: 'Réagissez à 20 messages', icon: 'heart', color: 'var(--color-pink, #eb459e)' },
    { name: 'Champion', type: 'WIN_GAME', target: 3, rewardCoins: 150, rewardXp: 75, frequency: 'WEEKLY', description: 'Gagnez 3 parties cette semaine', icon: 'crown', color: 'var(--color-warning)' },
    { name: 'Philanthrope', type: 'GIVE_REP', target: 5, rewardCoins: 100, rewardXp: 50, frequency: 'WEEKLY', description: 'Donnez 5 +rep cette semaine', icon: 'star', color: 'var(--color-success)' },
    { name: 'Créateur', type: 'CREATE_THREADS', target: 3, rewardCoins: 80, rewardXp: 40, frequency: 'WEEKLY', description: 'Créez 3 threads cette semaine', icon: 'edit', color: 'var(--color-primary)' },
  ];

  function openTemplates() {
    showTemplates = true;
    showCreate = false;
  }

  function selectTemplate(tpl: typeof questTemplates[0]) {
    newQuest = {
      name: tpl.name,
      description: tpl.description,
      type: tpl.type,
      frequency: tpl.frequency,
      target: tpl.target,
      rewardCoins: tpl.rewardCoins,
      rewardXp: tpl.rewardXp,
    };
    showTemplates = false;
    showCreate = true;
  }

  function openBlankForm() {
    newQuest = { name: '', description: '', type: 'SEND_MESSAGES', frequency: 'DAILY', target: 10, rewardCoins: 50, rewardXp: 25 };
    showTemplates = false;
    showCreate = true;
  }

  async function load() {
    loading = true;
    try {
      data = await fetchQuestsData();
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      loading = false;
    }
  }

  async function handleCreate() {
    if (!newQuest.name) { toast.error('Le nom est requis'); return; }
    try {
      await createQuest(newQuest);
      showCreate = false;
      newQuest = { name: '', description: '', type: 'SEND_MESSAGES', frequency: 'DAILY', target: 10, rewardCoins: 50, rewardXp: 25 };
      await load();
    } catch {
      toast.error('Erreur lors de la création');
    }
  }

  async function handleToggle(quest: any) {
    try {
      await updateQuest(quest.id, { enabled: !quest.enabled });
      await load();
    } catch {
      toast.error('Erreur lors de la mise a jour');
    }
  }

  async function handleDelete(questId: string) {
    try {
      await deleteQuest(questId);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression');
    }
  }

  onMount(load);
</script>

<div class="page-header">
  <div class="header-left">
    <h1><Papicon name="compass" size={24} /> Quetes</h1>
    <p class="subtitle">Quetes quotidiennes et hebdomadaires avec recompenses</p>
  </div>
  <button class="btn btn-primary" onclick={openTemplates}>
    <Papicon name="plus" size={16} /> Nouvelle quete
  </button>
</div>

{#if showTemplates}
  <div class="card template-picker">
    <div class="template-header">
      <h3>Choisir un modele</h3>
      <p class="template-subtitle">Selectionnez un modele pre-configure ou creez une quete personnalisee</p>
    </div>
    <div class="template-grid">
      {#each questTemplates as tpl}
        <button class="template-card" onclick={() => selectTemplate(tpl)} style="--tpl-color: {tpl.color}">
          <div class="template-icon">
            <Papicon name={tpl.icon} size={22} />
          </div>
          <div class="template-info">
            <span class="template-name">{tpl.name}</span>
            <span class="template-desc">{tpl.description}</span>
          </div>
          <div class="template-meta">
            <span class="badge" class:badge-daily={tpl.frequency === 'DAILY'} class:badge-weekly={tpl.frequency === 'WEEKLY'}>
              {tpl.frequency === 'DAILY' ? 'Quotidienne' : 'Hebdomadaire'}
            </span>
            <span class="template-rewards">{tpl.rewardCoins} coins / {tpl.rewardXp} XP</span>
          </div>
        </button>
      {/each}
      <button class="template-card template-custom" onclick={openBlankForm}>
        <div class="template-icon custom-icon">
          <Papicon name="plus" size={22} />
        </div>
        <div class="template-info">
          <span class="template-name">Personnalisee</span>
          <span class="template-desc">Creez une quete sur-mesure</span>
        </div>
      </button>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick={() => showTemplates = false}>Annuler</button>
    </div>
  </div>
{/if}

{#if showCreate}
  <div class="card create-form">
    <h3>Creer une quete</h3>
    <div class="form-grid">
      <div class="form-group">
        <label>Nom</label>
        <input type="text" bind:value={newQuest.name} placeholder="Bavard du jour" />
      </div>
      <div class="form-group">
        <label>Description</label>
        <input type="text" bind:value={newQuest.description} placeholder="Envoyez 50 messages aujourd'hui" />
      </div>
      <div class="form-group">
        <label>Type</label>
        <select bind:value={newQuest.type}>
          {#each Object.entries(questTypes) as [key, label]}
            <option value={key}>{label}</option>
          {/each}
        </select>
      </div>
      <div class="form-group">
        <label>Frequence</label>
        <select bind:value={newQuest.frequency}>
          <option value="DAILY">Quotidienne</option>
          <option value="WEEKLY">Hebdomadaire</option>
        </select>
      </div>
      <div class="form-group">
        <label>Objectif</label>
        <input type="number" bind:value={newQuest.target} min="1" />
      </div>
      <div class="form-group">
        <label>Recompense (coins)</label>
        <input type="number" bind:value={newQuest.rewardCoins} min="0" />
      </div>
      <div class="form-group">
        <label>Recompense (XP)</label>
        <input type="number" bind:value={newQuest.rewardXp} min="0" />
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" onclick={() => showCreate = false}>Annuler</button>
      <button class="btn btn-primary" onclick={handleCreate}>Creer</button>
    </div>
  </div>
{/if}

{#if loading}
  <div class="loading-container"><div class="spinner"></div></div>
{:else if data}
  <div class="stats-bar">
    <div class="stat">
      <div class="stat-icon" style="color: var(--color-primary)">
        <Papicon name="compass" size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-value">{data.definitions.length}</span>
        <span class="stat-label">Quetes configurees</span>
      </div>
    </div>
    <div class="stat">
      <div class="stat-icon" style="color: var(--color-success)">
        <Papicon name="check" size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-value">{data.definitions.filter((q: any) => q.enabled).length}</span>
        <span class="stat-label">Quetes actives</span>
      </div>
    </div>
    <div class="stat">
      <div class="stat-icon" style="color: var(--color-warning)">
        <Papicon name="star" size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-value">{data.totalClaimed}</span>
        <span class="stat-label">Recompenses reclamees</span>
      </div>
    </div>
  </div>

  {#if data.definitions.length === 0}
    <div class="empty-state">
      <Papicon name="compass" size={48} />
      <p>Aucune quete configuree. Cliquez sur "Nouvelle quete" pour commencer.</p>
    </div>
  {:else}
    <div class="quests-list">
      {#each data.definitions as quest}
        {#if quest.frequency === 'DAILY'}
          <div class="card quest-card daily-border" class:disabled={!quest.enabled}>
            <div class="quest-header">
              <div class="quest-info">
                <h4>{quest.name}</h4>
                <p class="quest-desc">{quest.description}</p>
              </div>
              <div class="quest-badges">
                <span class="badge badge-daily">Quotidienne</span>
                <span class="badge badge-type">{questTypes[quest.type] ?? quest.type}</span>
              </div>
            </div>
            <div class="quest-details">
              <div class="quest-detail-item">
                <Papicon name="flag" size={14} />
                <span>Objectif: <strong>{quest.target}</strong></span>
              </div>
              <div class="quest-detail-item">
                <Papicon name="dollar-sign" size={14} />
                <span>Coins: <strong>{quest.rewardCoins}</strong></span>
              </div>
              <div class="quest-detail-item">
                <Papicon name="trending-up" size={14} />
                <span>XP: <strong>{quest.rewardXp}</strong></span>
              </div>
            </div>
            <div class="quest-progress-section">
              <div class="quest-participations">
                <Papicon name="users" size={14} />
                <span>{quest._count?.progress ?? 0} participations</span>
              </div>
              {#if (quest._count?.progress ?? 0) > 0}
                <div class="progress-bar-track">
                  <div class="progress-bar-fill daily-fill" style="width: {Math.min(100, ((quest._count?.progress ?? 0) / Math.max(quest.target, 1)) * 100)}%"></div>
                </div>
              {/if}
            </div>
            <div class="quest-actions">
              <button class="btn btn-sm" class:btn-success={!quest.enabled} class:btn-secondary={quest.enabled} onclick={() => handleToggle(quest)}>
                {quest.enabled ? 'Desactiver' : 'Activer'}
              </button>
              <button class="btn btn-sm btn-danger" onclick={() => handleDelete(quest.id)}>Supprimer</button>
            </div>
          </div>
        {:else}
          <div class="card quest-card weekly-border" class:disabled={!quest.enabled}>
            <div class="quest-header">
              <div class="quest-info">
                <h4>{quest.name}</h4>
                <p class="quest-desc">{quest.description}</p>
              </div>
              <div class="quest-badges">
                <span class="badge badge-weekly">Hebdomadaire</span>
                <span class="badge badge-type">{questTypes[quest.type] ?? quest.type}</span>
              </div>
            </div>
            <div class="quest-details">
              <div class="quest-detail-item">
                <Papicon name="flag" size={14} />
                <span>Objectif: <strong>{quest.target}</strong></span>
              </div>
              <div class="quest-detail-item">
                <Papicon name="dollar-sign" size={14} />
                <span>Coins: <strong>{quest.rewardCoins}</strong></span>
              </div>
              <div class="quest-detail-item">
                <Papicon name="trending-up" size={14} />
                <span>XP: <strong>{quest.rewardXp}</strong></span>
              </div>
            </div>
            <div class="quest-progress-section">
              <div class="quest-participations">
                <Papicon name="users" size={14} />
                <span>{quest._count?.progress ?? 0} participations</span>
              </div>
              {#if (quest._count?.progress ?? 0) > 0}
                <div class="progress-bar-track">
                  <div class="progress-bar-fill weekly-fill" style="width: {Math.min(100, ((quest._count?.progress ?? 0) / Math.max(quest.target, 1)) * 100)}%"></div>
                </div>
              {/if}
            </div>
            <div class="quest-actions">
              <button class="btn btn-sm" class:btn-success={!quest.enabled} class:btn-secondary={quest.enabled} onclick={() => handleToggle(quest)}>
                {quest.enabled ? 'Desactiver' : 'Activer'}
              </button>
              <button class="btn btn-sm btn-danger" onclick={() => handleDelete(quest.id)}>Supprimer</button>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {/if}
{/if}

<style>
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
  .header-left h1 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem; margin: 0; }
  .subtitle { color: var(--color-text-muted); margin: 0.25rem 0 0; font-size: 0.875rem; }

  .card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
  .card h3 { margin: 0 0 1rem; font-size: 0.95rem; }

  /* Template picker */
  .template-picker { margin-bottom: 1rem; }
  .template-header { margin-bottom: 1.25rem; }
  .template-subtitle { color: var(--color-text-muted); font-size: 0.85rem; margin: 0.25rem 0 0; }
  .template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
  .template-card {
    display: flex; flex-direction: column; gap: 0.75rem;
    background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 10px;
    padding: 1rem; cursor: pointer; text-align: left; transition: all 0.2s;
    border-left: 3px solid var(--tpl-color, var(--color-border));
  }
  .template-card:hover { border-color: var(--tpl-color, var(--color-primary)); background: var(--color-surface); transform: translateY(-1px); }
  .template-icon { color: var(--tpl-color, var(--color-primary)); }
  .template-info { display: flex; flex-direction: column; gap: 0.2rem; }
  .template-name { font-weight: 600; font-size: 0.9rem; color: var(--color-text); }
  .template-desc { font-size: 0.8rem; color: var(--color-text-muted); }
  .template-meta { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .template-rewards { font-size: 0.75rem; color: var(--color-text-muted); }
  .template-custom { border-left-color: var(--color-border); }
  .custom-icon { color: var(--color-text-muted); }

  /* Create form */
  .create-form { margin-bottom: 1rem; }
  .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
  .form-group label { display: block; font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 0.25rem; }
  .form-group input, .form-group select { width: 100%; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-bg); color: var(--color-text); }
  .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }

  /* Stats bar */
  .stats-bar { display: flex; gap: 1rem; margin-bottom: 1.25rem; }
  .stat {
    flex: 1; display: flex; align-items: center; gap: 0.75rem;
    background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; padding: 0.85rem 1rem;
  }
  .stat-icon { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; background: var(--color-bg); flex-shrink: 0; }
  .stat-content { display: flex; flex-direction: column; }
  .stat-value { font-size: 1.3rem; font-weight: 700; line-height: 1.2; }
  .stat-label { font-size: 0.72rem; color: var(--color-text-muted); }

  /* Quest cards */
  .quests-list { display: flex; flex-direction: column; }
  .quest-card.disabled { opacity: 0.5; }
  .quest-card.daily-border { border-left: 3px solid var(--color-primary); }
  .quest-card.weekly-border { border-left: 3px solid var(--color-pink, #eb459e); }

  .quest-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  .quest-info h4 { margin: 0; font-size: 1rem; }
  .quest-desc { margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--color-text-muted); }
  .quest-badges { display: flex; gap: 0.5rem; flex-shrink: 0; }

  .quest-details { display: flex; gap: 1.5rem; margin: 0.75rem 0; flex-wrap: wrap; }
  .quest-detail-item { display: flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; color: var(--color-text-muted); }

  .quest-progress-section { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem; }
  .quest-participations { display: flex; align-items: center; gap: 0.35rem; font-size: 0.82rem; color: var(--color-text-muted); flex-shrink: 0; }
  .progress-bar-track { flex: 1; height: 6px; background: var(--color-bg); border-radius: 3px; overflow: hidden; max-width: 200px; }
  .progress-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
  .progress-bar-fill.daily-fill { background: var(--color-primary); }
  .progress-bar-fill.weekly-fill { background: var(--color-pink, #eb459e); }

  .quest-actions { display: flex; gap: 0.5rem; }

  .badge { padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
  .badge-daily { background: rgba(88, 101, 242, 0.15); color: var(--color-primary); }
  .badge-weekly { background: rgba(235, 69, 158, 0.15); color: var(--color-pink, #eb459e); }
  .badge-type { background: var(--color-border); color: var(--color-text-muted); }

  .empty-state, .loading-container { display: flex; flex-direction: column; align-items: center; padding: 4rem; color: var(--color-text-muted); gap: 1rem; }

  @media (max-width: 768px) {
    .stats-bar { flex-direction: column; }
    .template-grid { grid-template-columns: 1fr; }
    .quest-header { flex-direction: column; }
    .quest-badges { flex-wrap: wrap; }
    .quest-details { flex-direction: column; gap: 0.5rem; }
    .quest-progress-section { flex-direction: column; align-items: flex-start; }
    .progress-bar-track { max-width: 100%; width: 100%; }
  }
</style>
