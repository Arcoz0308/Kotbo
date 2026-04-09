<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '../lib/stores/auth.svelte';
  import { API_BASE_URL } from '../lib/api';
  import type { APIKey, StaffMember } from '@prisma/client';

  let user: any = null;
  let staffMember: StaffMember | null = null;
  let apiKeys: APIKey[] = [];
  let isBlacklisted = false;
  let blacklistReason = '';
  let blacklistEndDate: string | null = null;
  let accessibleTools: string[] = [];
  let stats: any = null;
  let loading = true;
  let error = '';
  let showNewKeyForm = false;
  let newKeyName = 'Ma clé API';

  onMount(async () => {
    if (!authStore.token) {
      error = 'Non authentifié';
      loading = false;
      return;
    }

    try {
      // Récupérer l'utilisateur actuel
      const meRes = await fetch(`${API_BASE_URL}/api/user/me`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      const meData = await meRes.json();
      user = meData;

      // Récupérer le profil staff et les clés API
      const profileRes = await fetch(`${API_BASE_URL}/api/dashboard/users/${meData.id}/profile`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      const profileData = await profileRes.json();
      staffMember = profileData.staffMember;
      apiKeys = profileData.apiKeys || [];
      isBlacklisted = profileData.isBlacklisted;
      blacklistReason = profileData.blacklistReason;
      blacklistEndDate = profileData.blacklistEndDate;
      accessibleTools = profileData.accessibleTools || [];

      // Récupérer les stats
      if (staffMember) {
        const statsRes = await fetch(`${API_BASE_URL}/api/dashboard/users/${meData.id}/staff-stats`, {
          headers: { Authorization: `Bearer ${authStore.token}` }
        });
        const statsData = await statsRes.json();
        stats = statsData.stats;
      }

      loading = false;
    } catch (err) {
      console.error('Erreur lors du chargement du profil:', err);
      error = 'Erreur lors du chargement du profil';
      loading = false;
    }
  });

  async function createNewAPIKey() {
    if (!user || !staffMember) return;

    try {
      const res = await fetch(`/api/dashboard/guilds/${staffMember.guildId}/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          name: newKeyName,
          permissions: ['daily_algo:create_exercise']
        })
      });

      if (!res.ok) throw new Error('Erreur lors de la création de la clé API');

      const data = await res.json();
      // Afficher la clé complète une seule fois à l'utilisateur
      alert(`Votre clé API a été créée:\n\n${data.fullKey}\n\nCopie-la maintenant, tu ne pourras pas la revoir!`);
      
      // Recharger les clés API
      const keysRes = await fetch(`/api/dashboard/guilds/${staffMember.guildId}/api-keys`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      const keysData = await keysRes.json();
      apiKeys = keysData.keys;
      showNewKeyForm = false;
      newKeyName = 'Ma clé API';
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de la création de la clé API');
    }
  }

  async function deleteAPIKey(keyId: string) {
    if (!staffMember || !confirm('Tu es sûr de vouloir supprimer cette clé API?')) return;

    try {
      const res = await fetch(`/api/dashboard/guilds/${staffMember.guildId}/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authStore.token}` }
      });

      if (!res.ok) throw new Error('Erreur lors de la suppression');

      // Recharger les clés API
      const keysRes = await fetch(`/api/dashboard/guilds/${staffMember.guildId}/api-keys`, {
        headers: { Authorization: `Bearer ${authStore.token}` }
      });
      const keysData = await keysRes.json();
      apiKeys = keysData.keys;
    } catch (err) {
      console.error('Erreur:', err);
      alert('Erreur lors de la suppression');
    }
  }
</script>

<div class="profile-container">
  {#if loading}
    <div class="loading">Chargement...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if user && staffMember}
    <div class="profile-header">
      <h1>Mon Profil Staff</h1>
      <div class="profile-info">
        <div class="user-card">
          {#if staffMember.avatarUrl}
            <img src={staffMember.avatarUrl} alt="Avatar" class="avatar" />
          {/if}
          <div class="user-details">
            <h2>{staffMember.displayName || staffMember.username}</h2>
            <p class="staff-grade">Grade: <strong>{staffMember.grade}</strong></p>
            {#if isBlacklisted}
              <p class="blacklist-warning">⚠️ Blacklisté: {blacklistReason}</p>
              {#if blacklistEndDate}
                <p class="blacklist-end">Jusqu'au: {new Date(blacklistEndDate).toLocaleDateString('fr')}</p>
              {:else}
                <p class="blacklist-permanent">Permanent</p>
              {/if}
            {/if}
          </div>
        </div>

        {#if stats}
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">{stats.totalMessages}</div>
              <div class="stat-label">Messages</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{stats.totalVoiceMinutes}</div>
              <div class="stat-label">Minutes Vocal</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{stats.activeWarnings}</div>
              <div class="stat-label">Avertissements</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{stats.sanctionsIssued ?? 0}</div>
              <div class="stat-label">Sanctions émises</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{stats.pendingReports ?? 0}</div>
              <div class="stat-label">Rapports en attente</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{new Date(stats.joinedStaffAt).toLocaleDateString('fr')}</div>
              <div class="stat-label">Depuis le (Staff)</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">{new Date(stats.currentRoleStartedAt).toLocaleDateString('fr')}</div>
              <div class="stat-label">Depuis le (Grade)</div>
            </div>
          </div>
        {/if}

        {#if accessibleTools.length > 0}
          <div class="tools-section">
            <h3 class="tools-title">Outils Accessibles</h3>
            <div class="tools-grid">
              {#each accessibleTools as tool}
                <div class="tool-badge">{tool}</div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="api-keys-section">
      <div class="section-header">
        <h3>Mes Clés API</h3>
        <button on:click={() => showNewKeyForm = !showNewKeyForm} class="btn-primary">
          {showNewKeyForm ? 'Annuler' : '+ Nouvelle clé'}
        </button>
      </div>

      {#if showNewKeyForm}
        <div class="new-key-form">
          <input
            type="text"
            placeholder="Nom de la clé"
            bind:value={newKeyName}
            class="form-input"
          />
          <button on:click={createNewAPIKey} class="btn-success">Créer la clé</button>
        </div>
      {/if}

      {#if apiKeys.length > 0}
        <div class="keys-list">
          {#each apiKeys as key (key.id)}
            <div class="key-card">
              <div class="key-info">
                <div class="key-display">{key.displayKey}</div>
                <div class="key-name">{key.name}</div>
                <div class="key-perms">
                  {#each key.permissions as perm}
                    <span class="perm-badge">{perm}</span>
                  {/each}
                </div>
                {#if key.lastUsedAt}
                  <small>Dernière utilisation: {new Date(key.lastUsedAt).toLocaleDateString('fr')}</small>
                {/if}
              </div>
              <button on:click={() => deleteAPIKey(key.id)} class="btn-danger">Supprimer</button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="no-keys">Aucune clé API créée. Crée une nouvelle clé pour utiliser l'API Kotbo.</p>
      {/if}
    </div>
  {:else}
    <div class="error">Aucun profil staff trouvé</div>
  {/if}
</div>

<style>
  .profile-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  .loading, .error {
    text-align: center;
    padding: 2rem;
    font-size: 1.1rem;
  }

  .error {
    color: #d32f2f;
  }

  .profile-header {
    margin-bottom: 3rem;
  }

  .profile-header h1 {
    margin-bottom: 1.5rem;
    font-size: 2rem;
  }

  .user-card {
    display: flex;
    gap: 2rem;
    padding: 2rem;
    background: var(--color-surface);
    border-radius: 8px;
    margin-bottom: 2rem;
    align-items: center;
  }

  .avatar {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    object-fit: cover;
  }

  .user-details h2 {
    margin: 0;
    font-size: 1.5rem;
  }

  .staff-grade {
    margin: 0.5rem 0;
    font-size: 1.1rem;
    color: var(--color-primary);
  }

  .blacklist-warning {
    margin: 0.5rem 0;
    color: #d32f2f;
    font-weight: bold;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-top: 2rem;
  }

  .stat-card {
    padding: 1rem;
    background: var(--color-surface);
    border-radius: 8px;
    text-align: center;
  }

  .stat-value {
    font-size: 1.8rem;
    font-weight: bold;
    color: var(--color-primary);
  }

  .stat-label {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  .tools-section {
    margin-top: 2rem;
    padding: 1.5rem;
    background: var(--color-surface);
    border-radius: 8px;
    border-left: 4px solid var(--color-primary);
  }

  .tools-title {
    margin: 0 0 1rem 0;
    font-size: 1.2rem;
    color: var(--color-text-secondary);
  }

  .tools-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
  }

  .tool-badge {
    background: var(--color-background);
    color: var(--color-primary);
    padding: 0.5rem 1rem;
    border-radius: 20px;
    font-size: 0.9rem;
    font-weight: 500;
    border: 1px solid var(--color-primary);
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }

  .api-keys-section {
    background: var(--color-surface);
    padding: 2rem;
    border-radius: 8px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .section-header h3 {
    margin: 0;
  }

  .new-key-form {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding: 1rem;
    background: var(--color-background);
    border-radius: 4px;
  }

  .form-input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .keys-list {
    display: grid;
    gap: 1rem;
  }

  .key-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: var(--color-background);
    border-radius: 4px;
    border-left: 4px solid var(--color-primary);
  }

  .key-info {
    flex: 1;
  }

  .key-display {
    font-family: monospace;
    font-size: 0.9rem;
    margin-bottom: 0.25rem;
  }

  .key-name {
    font-weight: bold;
    margin-bottom: 0.5rem;
  }

  .key-perms {
    margin-bottom: 0.5rem;
  }

  .perm-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: var(--color-primary);
    color: white;
    border-radius: 3px;
    font-size: 0.75rem;
    margin-right: 0.5rem;
  }

  .no-keys {
    text-align: center;
    padding: 1rem;
    color: var(--color-text-secondary);
  }

  .btn-primary, .btn-success, .btn-danger {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.95rem;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--color-primary);
    color: white;
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-success {
    background: #4caf50;
    color: white;
  }

  .btn-success:hover {
    background: #45a049;
  }

  .btn-danger {
    background: #d32f2f;
    color: white;
  }

  .btn-danger:hover {
    background: #c62828;
  }
</style>
