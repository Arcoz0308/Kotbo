<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from 'tinro';
  import { resolveTabFromUrl, gotoTab } from '../lib/tabRouting';
  import { fetchMarketplaceData } from '../lib/api';
  import { toast } from '../lib/stores/toast.svelte';
  import Papicon from '../lib/components/Papicon.svelte';

  let loading = $state(true);
  let data: any = $state(null);
  const marketTabs = ['listings', 'history'] as const;
  let tab = $state<'listings' | 'history'>('listings');

  $effect(() => {
    const _path = $router.path;
    tab = resolveTabFromUrl('/marketplace', marketTabs, 'listings') as typeof tab;
  });

  async function load() {
    loading = true;
    try {
      data = await fetchMarketplaceData();
    } catch {
      toast.error('Erreur lors du chargement');
    } finally {
      loading = false;
    }
  }

  function getStatusClass(status: string): string {
    const map: Record<string, string> = { ACTIVE: 'badge-success', SOLD: 'badge-primary', CANCELLED: 'badge-muted', EXPIRED: 'badge-warning' };
    return map[status] ?? '';
  }

  function getStatusLabel(status: string): string {
    const map: Record<string, string> = { ACTIVE: 'En vente', SOLD: 'Vendu', CANCELLED: 'Annulé', EXPIRED: 'Expiré' };
    return map[status] ?? status;
  }

  function getTypeLabel(type: string): string {
    return type === 'AUCTION' ? 'Enchere' : 'Prix fixe';
  }

  function formatTimeLeft(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Expiré';
    const hours = Math.floor(diff / 3600000);
    if (hours > 24) return `${Math.floor(hours / 24)}j restants`;
    return `${hours}h restantes`;
  }

  onMount(load);
</script>

<div class="page-header">
  <div class="header-left">
    <h1><Papicon name="shopping-bag" size={24} /> Marche</h1>
    <p class="subtitle">Hotel des ventes --- echanges entre joueurs</p>
  </div>
</div>

{#if loading}
  <div class="loading-container"><div class="spinner"></div></div>
{:else if data}
  <div class="stats-bar">
    <div class="stat">
      <div class="stat-icon" style="color: var(--color-success)">
        <Papicon name="shopping-bag" size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-value">{data.activeListings.length}</span>
        <span class="stat-label">Annonces actives</span>
      </div>
    </div>
    <div class="stat">
      <div class="stat-icon" style="color: var(--color-primary)">
        <Papicon name="trending-up" size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-value">{data.totalTransactions}</span>
        <span class="stat-label">Transactions totales</span>
      </div>
    </div>
    <div class="stat">
      <div class="stat-icon" style="color: var(--color-warning)">
        <Papicon name="dollar-sign" size={20} />
      </div>
      <div class="stat-content">
        <span class="stat-value">{data.totalVolume.toLocaleString()}</span>
        <span class="stat-label">Volume total (coins)</span>
      </div>
    </div>
  </div>

  <div class="tabs">
    <button class="tab" class:active={tab === 'listings'} onclick={() => gotoTab('/marketplace', 'listings', 'listings')}>
      <Papicon name="grid" size={14} />
      Annonces ({data.activeListings.length})
    </button>
    <button class="tab" class:active={tab === 'history'} onclick={() => gotoTab('/marketplace', 'history', 'listings')}>
      <Papicon name="clock" size={14} />
      Historique ({data.recentTransactions.length})
    </button>
  </div>

  {#if tab === 'listings'}
    {#if data.activeListings.length === 0}
      <div class="empty-state-container">
        <div class="empty-state">
          <div class="empty-icon">
            <Papicon name="shopping-bag" size={48} />
          </div>
          <h3>Aucune annonce active</h3>
          <p>Les joueurs peuvent creer des annonces via la commande /market.</p>
        </div>
      </div>
    {:else}
      <div class="listings-grid">
        {#each data.activeListings as listing}
          <div class="listing-card">
            <div class="listing-top">
              <h4 class="listing-name">{listing.itemId}</h4>
              <span class="badge {getStatusClass(listing.status)}">{getStatusLabel(listing.status)}</span>
            </div>
            <div class="listing-body">
              <div class="listing-price-row">
                <span class="listing-price">
                  <Papicon name="dollar-sign" size={14} />
                  {listing.price.toLocaleString()} coins
                </span>
                <span class="listing-qty">x{listing.quantity}</span>
              </div>
              {#if listing.type === 'AUCTION' && listing.currentBid}
                <div class="listing-bid">
                  <Papicon name="trending-up" size={13} />
                  Enchere actuelle: {listing.currentBid.toLocaleString()} coins
                </div>
              {/if}
              <div class="listing-meta">
                <span class="badge badge-type">{getTypeLabel(listing.type)}</span>
                <span class="listing-time">
                  <Papicon name="clock" size={12} />
                  {formatTimeLeft(listing.expiresAt)}
                </span>
              </div>
            </div>
            <div class="listing-footer">
              <span class="listing-seller">
                <Papicon name="user" size={12} />
                {listing.sellerId}
              </span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {:else}
    {#if data.recentTransactions.length === 0}
      <div class="empty-state-container">
        <div class="empty-state">
          <div class="empty-icon">
            <Papicon name="clock" size={48} />
          </div>
          <h3>Aucune transaction recente</h3>
          <p>L'historique des ventes apparaitra ici.</p>
        </div>
      </div>
    {:else}
      <div class="transactions-list">
        {#each data.recentTransactions as tx}
          <div class="tx-card">
            <div class="tx-item-info">
              <span class="tx-item-name">{tx.itemId}</span>
              <span class="tx-qty">x{tx.quantity}</span>
            </div>
            <div class="tx-flow">
              <div class="tx-actor">
                <Papicon name="user" size={13} />
                <span class="tx-actor-id">{tx.sellerId}</span>
              </div>
              <div class="tx-arrow">
                <Papicon name="arrow-right" size={16} />
              </div>
              <div class="tx-actor">
                <Papicon name="user" size={13} />
                <span class="tx-actor-id">{tx.buyerId}</span>
              </div>
            </div>
            <div class="tx-right">
              <span class="tx-price">
                <Papicon name="dollar-sign" size={13} />
                {tx.price.toLocaleString()} coins
              </span>
              <span class="tx-date">{new Date(tx.createdAt).toLocaleDateString('fr-FR')}</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
{/if}

<style>
  .page-header { margin-bottom: 1.5rem; }
  .page-header h1 { display: flex; align-items: center; gap: 0.5rem; font-size: 1.5rem; margin: 0; }
  .subtitle { color: var(--color-text-muted); margin: 0.25rem 0 0; font-size: 0.875rem; }

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

  /* Tabs */
  .tabs { display: flex; gap: 0.25rem; margin-bottom: 1rem; }
  .tab {
    display: flex; align-items: center; gap: 0.4rem;
    padding: 0.5rem 1rem; border: none; background: var(--color-surface);
    border-radius: 8px; cursor: pointer; font-size: 0.85rem; color: var(--color-text-muted);
    transition: all 0.15s;
  }
  .tab.active { background: var(--color-primary); color: white; }

  /* Listings grid */
  .listings-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }

  .listing-card {
    background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;
    padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem;
    transition: border-color 0.15s;
  }
  .listing-card:hover { border-color: var(--color-primary); }

  .listing-top { display: flex; justify-content: space-between; align-items: center; }
  .listing-name { margin: 0; font-size: 0.95rem; font-weight: 600; }

  .listing-body { display: flex; flex-direction: column; gap: 0.5rem; }
  .listing-price-row { display: flex; justify-content: space-between; align-items: center; }
  .listing-price { display: flex; align-items: center; gap: 0.3rem; font-weight: 700; color: var(--color-warning); font-size: 1rem; }
  .listing-qty { font-size: 0.85rem; color: var(--color-text-muted); font-weight: 500; }
  .listing-bid { display: flex; align-items: center; gap: 0.3rem; font-size: 0.82rem; color: var(--color-primary); font-weight: 500; }

  .listing-meta { display: flex; align-items: center; gap: 0.75rem; }
  .listing-time { display: flex; align-items: center; gap: 0.25rem; font-size: 0.78rem; color: var(--color-text-muted); }

  .listing-footer { padding-top: 0.5rem; border-top: 1px solid var(--color-border); }
  .listing-seller { display: flex; align-items: center; gap: 0.3rem; font-family: monospace; font-size: 0.75rem; color: var(--color-text-muted); }

  /* Transactions */
  .transactions-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .tx-card {
    background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px;
    padding: 0.85rem 1rem; display: flex; align-items: center; gap: 1rem;
  }

  .tx-item-info { display: flex; align-items: baseline; gap: 0.5rem; min-width: 120px; }
  .tx-item-name { font-weight: 600; font-size: 0.9rem; }
  .tx-qty { font-size: 0.8rem; color: var(--color-text-muted); }

  .tx-flow { display: flex; align-items: center; gap: 0.5rem; flex: 1; }
  .tx-actor { display: flex; align-items: center; gap: 0.3rem; }
  .tx-actor-id { font-family: monospace; font-size: 0.78rem; color: var(--color-text-muted); }
  .tx-arrow { color: var(--color-primary); display: flex; align-items: center; }

  .tx-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.15rem; flex-shrink: 0; }
  .tx-price { display: flex; align-items: center; gap: 0.2rem; font-weight: 600; color: var(--color-warning); font-size: 0.85rem; }
  .tx-date { font-size: 0.72rem; color: var(--color-text-muted); }

  /* Badges */
  .badge { padding: 0.15rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
  .badge-success { background: rgba(87, 242, 135, 0.15); color: var(--color-success); }
  .badge-primary { background: rgba(88, 101, 242, 0.15); color: var(--color-primary); }
  .badge-warning { background: rgba(254, 231, 92, 0.15); color: var(--color-warning); }
  .badge-muted { background: var(--color-border); color: var(--color-text-muted); }
  .badge-type { background: var(--color-bg); color: var(--color-text-secondary); font-size: 0.72rem; }

  /* Empty state */
  .empty-state-container { display: flex; justify-content: center; padding: 2rem 0; }
  .empty-state {
    display: flex; flex-direction: column; align-items: center; gap: 0.75rem;
    background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 12px;
    padding: 3rem 4rem; text-align: center;
  }
  .empty-icon { color: var(--color-text-muted); opacity: 0.5; }
  .empty-state h3 { margin: 0; font-size: 1rem; color: var(--color-text-secondary); }
  .empty-state p { margin: 0; font-size: 0.85rem; color: var(--color-text-muted); }

  .loading-container { display: flex; justify-content: center; padding: 4rem; }

  @media (max-width: 768px) {
    .stats-bar { flex-direction: column; }
    .listings-grid { grid-template-columns: 1fr; }
    .tx-card { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
    .tx-right { align-items: flex-start; }
    .empty-state { padding: 2rem; }
  }
</style>
