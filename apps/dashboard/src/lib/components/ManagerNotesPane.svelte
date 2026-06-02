<script lang="ts">
  import { authStore } from '../stores/auth.svelte';
  import { toast } from '../stores/toast.svelte';
  import { API_BASE_URL, deleteManagerNote } from '../api';
  import type { StaffManagerNote } from '../types';
  import { onMount } from 'svelte';
  import Papicon from './Papicon.svelte';

  interface Props {
    userId: string;
    notes: StaffManagerNote[];
    onNoteAdded: () => void;
    onNoteDeleted: () => void;
  }

  let { userId, notes, onNoteAdded, onNoteDeleted }: Props = $props();

  let newNote = $state('');
  let isSaving = $state(false);
  let error = $state('');

  async function handleAddNote() {
    if (!newNote.trim()) return;
    isSaving = true;
    error = '';
    try {
      const res = await fetch(`${API_BASE_URL}/api/dashboard/guilds/${authStore.selectedGuildId}/staff/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authStore.token}`
        },
        body: JSON.stringify({
          staffUserId: userId,
          content: newNote
        })
      });

      if (!res.ok) throw new Error('Erreur lors de l\'ajout de la note');
      
      newNote = '';
      onNoteAdded();
    } catch (err: any) {
      error = err.message;
    } finally {
      isSaving = false;
    }
  }

  async function handleDelete(noteId: string) {
    if (!confirm('Supprimer cette note definitivement ?')) return;
    try {
      await deleteManagerNote(noteId);
      onNoteDeleted();
    } catch (err) {
      toast.error('Erreur lors de la suppression');
    }
  }

  function formatDate(date: string) {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  const getAuthorAvatar = (author: any) => {
    if (author?.avatarUrl) return author.avatarUrl;
    return `https://cdn.discordapp.com/embed/avatars/${parseInt(author?.userId || '0') % 5}.png`;
  };
</script>

<div class="space-y-6">
  <!-- Note Input -->
  <div class="premium-card rounded-3xl p-6 bg-surface-container-low/40 border-outline-variant/10">
    <div class="flex items-center gap-3 mb-4">
      <div class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
        <Papicon icon="edit_note" size={24} />
      </div>
      <div>
        <h4 class="text-sm font-black uppercase tracking-widest text-on-surface">Ajouter une note</h4>
        <p class="text-[10px] text-on-surface-variant/50">Visible uniquement par l'administration</p>
      </div>
    </div>

    <div class="relative">
      <textarea
        bind:value={newNote}
        placeholder="Rédiger une observation, un avertissement oral ou une note de suivi..."
        rows="3"
        class="w-full bg-surface-container/30 border border-outline-variant/20 rounded-2xl p-4 text-sm text-on-surface placeholder:text-on-surface-variant/30 focus:outline-hidden focus:border-primary/50 transition-all resize-none"
      ></textarea>
      {#if error}
        <p class="text-[10px] text-rose-500 mt-2 font-bold">{error}</p>
      {/if}
    </div>

    <div class="mt-4 flex justify-end">
      <button
        onclick={handleAddNote}
        disabled={isSaving || !newNote.trim()}
        class="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 transition-all font-headline"
      >
        <Papicon icon={isSaving ? 'progress_activity' : 'send'} size={14} class={isSaving ? 'animate-spin' : ''} />
        {isSaving ? 'Envoi...' : 'Enregistrer'}
      </button>
    </div>
  </div>

  <!-- Notes List -->
  <div class="space-y-4">
    {#each notes as note (note.id)}
      <div class="group relative flex gap-4 p-5 rounded-3xl border border-outline-variant/10 bg-surface-container-lowest/50 hover:bg-surface-container-low/80 hover:border-outline-variant/30 transition-all duration-300">
        <!-- Author Avatar -->
        <div class="shrink-0">
          <div class="w-10 h-10 rounded-2xl overflow-hidden border-2 border-outline-variant/20 group-hover:border-primary/30 transition-all">
            <img src={getAuthorAvatar(note.author)} alt="Avatar" class="w-full h-full object-cover" />
          </div>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-4 mb-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-black text-on-surface">{note.author?.displayName || 'Gestionnaire'}</span>
              <span class="text-[10px] text-on-surface-variant/40 font-bold uppercase tracking-wider">• {formatDate(note.createdAt)}</span>
            </div>
            
            <button
               onclick={() => handleDelete(note.id)}
               class="opacity-0 group-hover:opacity-100 text-on-surface-variant/20 hover:text-rose-500 transition-all"
               title="Supprimer la note"
            >
              <Papicon icon="delete" size={18} />
            </button>
          </div>

          <p class="text-sm text-on-surface-variant/80 leading-relaxed whitespace-pre-wrap">
            {note.content}
          </p>
        </div>

        <!-- Decorative stem for conversation-like feel -->
        <div class="absolute left-9 bottom-0 top-14 w-0.5 bg-outline-variant/10 -z-10 group-last:hidden"></div>
      </div>
    {:else}
      <div class="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-outline-variant/15 rounded-[2.5rem]">
        <div class="w-16 h-16 rounded-3xl bg-surface-container text-on-surface-variant/20 flex items-center justify-center">
          <Papicon icon="notes" size={30} />
        </div>
        <h4 class="mt-4 text-sm font-black text-on-surface/40 uppercase tracking-widest">Aucune note</h4>
        <p class="mt-2 text-xs text-on-surface-variant/30 max-w-[200px]">Utilisez le formulaire ci-dessus pour ajouter le premier suivi.</p>
      </div>
    {/each}
  </div>
</div>
