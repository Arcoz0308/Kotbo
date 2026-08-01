<script lang="ts">
  import Papicon from './Papicon.svelte';
  import { m } from '../i18n';
  import {
    LEVELING_PRESETS,
    levelingPresetValues,
    levelingPresetHourlyXp,
    levelingPresetXpForLevel,
    type LevelingPreset,
  } from '../levelingPresets';

  const {
    selectedId = null,
    activeId = null,
    disabled = false,
    dirty = false,
    saving = false,
    moduleEnabled = true,
    onselect,
    onsave,
    ondetail,
  }: {
    selectedId?: string | null;
    activeId?: string | null;
    disabled?: boolean;
    dirty?: boolean;
    saving?: boolean;
    moduleEnabled?: boolean;
    onselect: (preset: LevelingPreset) => void;
    onsave: () => void;
    ondetail: (preset: LevelingPreset) => void;
  } = $props();

  // Un prereglage ajoute sans sa traduction doit afficher une carte muette,
  // pas faire tomber la page entiere sur un appel de fonction absente.
  const PRESET_LABELS: Record<string, { name: () => string; desc: () => string }> = {
    basic: { name: m.lv_preset_basic_name, desc: m.lv_preset_basic_desc },
    fast: { name: m.lv_preset_fast_name, desc: m.lv_preset_fast_desc },
    progressive: { name: m.lv_preset_progressive_name, desc: m.lv_preset_progressive_desc },
    calm: { name: m.lv_preset_calm_name, desc: m.lv_preset_calm_desc },
    marathon: { name: m.lv_preset_marathon_name, desc: m.lv_preset_marathon_desc },
    prestige: { name: m.lv_preset_prestige_name, desc: m.lv_preset_prestige_desc },
  };

  function presetName(id: string): string {
    return PRESET_LABELS[id]?.name() ?? id;
  }

  function presetDesc(id: string): string {
    return PRESET_LABELS[id]?.desc() ?? '';
  }
</script>

<div class="space-y-8 animate-in fade-in duration-300">
  <div class="text-center max-w-2xl mx-auto space-y-2">
    <h2 class="text-2xl font-semibold text-on-surface font-headline">{m.lv_presets_title()}</h2>
    <p class="text-sm text-on-surface-variant/70">{m.lv_presets_desc()}</p>
  </div>

  {#if !moduleEnabled}
    <p class="text-xs text-on-surface-variant/70 bg-surface-container-high/30 border border-outline-variant/10 rounded-lg px-4 py-3 text-center">
      {m.lv_presets_module_off()}
    </p>
  {/if}

  <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
    {#each LEVELING_PRESETS as preset (preset.id)}
      {@const values = levelingPresetValues(preset)}
      {@const selected = selectedId === preset.id}
      <!-- Le liseré et la teinte ne servent qu'à deux états : le préréglage
           recommandé, et celui qu'on vient de choisir. Colorer les six cartes
           les rendrait indistinctes. -->
      {@const accented = selected || !!preset.recommended}
      <!-- Le lien "Détail" doit rester cliquable separement de la carte : un
           bouton imbrique dans un bouton n'est pas du HTML valide, d'ou le
           conteneur relatif et le positionnement absolu. -->
      <div class="relative">
        <button
          type="button"
          onclick={() => onselect(preset)}
          {disabled}
          aria-pressed={selected}
          class="relative overflow-hidden text-left w-full h-full p-6 rounded-xl border transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed {selected
            ? 'bg-primary/8 border-primary/50 shadow-lg shadow-primary/10'
            : preset.recommended
              ? 'bg-primary/3 border-primary/25 hover:border-primary/40 hover:bg-primary/6'
              : 'bg-surface-container-low/30 border-outline-variant/10 hover:border-outline-variant/30 hover:bg-surface-container-high/20'}"
        >
          {#if accented}
            <span class="absolute inset-x-0 top-0 h-[3px] bg-primary {selected ? '' : 'opacity-50'}" aria-hidden="true"></span>
          {/if}

          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center {accented ? 'bg-primary/15' : 'bg-surface-container-high/40'}">
                <Papicon icon={preset.icon} size={18} class={accented ? 'text-primary' : 'text-on-surface-variant/70'} />
              </div>
              <h3 class="text-base font-semibold text-on-surface truncate">{presetName(preset.id)}</h3>
            </div>
            {#if activeId === preset.id}
              <span class="shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-tertiary/15 text-tertiary">
                {m.lv_presets_active()}
              </span>
            {:else if selected}
              <span class="shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg bg-primary/15 text-primary">
                {m.lv_presets_selected()}
              </span>
            {:else if preset.recommended}
              <span class="shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg border border-primary/30 text-primary/80">
                {m.lv_presets_recommended()}
              </span>
            {/if}
          </div>

          <p class="text-[13px] text-on-surface-variant/70 mt-3 leading-relaxed">{presetDesc(preset.id)}</p>

          <div class="grid grid-cols-2 gap-2.5 mt-5">
            <div class="px-3 py-2 bg-surface-container-high/20 border border-outline-variant/5 rounded-lg">
              <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">{m.lv_gains_tile_message()}</p>
              <p class="text-sm font-semibold text-on-surface">{values.xpMin} – {values.xpMax}</p>
            </div>
            <div class="px-3 py-2 bg-surface-container-high/20 border border-outline-variant/5 rounded-lg">
              <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">{m.lv_gains_tile_cooldown()}</p>
              <p class="text-sm font-semibold text-on-surface">{values.cooldownSeconds} s</p>
            </div>
            <div class="px-3 py-2 bg-surface-container-high/20 border border-outline-variant/5 rounded-lg">
              <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">{m.lv_gains_tile_hourly()}</p>
              <p class="text-sm font-semibold text-on-surface">≈ {levelingPresetHourlyXp(preset).toLocaleString()}</p>
            </div>
            <div class="px-3 py-2 bg-surface-container-high/20 border border-outline-variant/5 rounded-lg">
              <p class="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">{m.lv_presets_tile_level_10()}</p>
              <p class="text-sm font-semibold text-on-surface">{levelingPresetXpForLevel(preset, 10).toLocaleString()} XP</p>
            </div>
          </div>

          <p class="text-[11px] text-on-surface-variant/50 mt-3 pr-24">
            {values.maxLevel > 0 ? m.lv_presets_max_level({ level: values.maxLevel }) : m.lv_presets_no_max_level()}
          </p>
        </button>

        <button
          type="button"
          onclick={() => ondetail(preset)}
          {disabled}
          class="group absolute bottom-5 right-5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-on-surface-variant/70 border border-outline-variant/15 bg-surface-container-high/30 hover:text-primary hover:border-primary/40 hover:bg-primary/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {m.lv_presets_card_detail()}
          <Papicon icon="ArrowRight" size={12} class="transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    {/each}
  </div>

  <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-low/30 border border-outline-variant/10 rounded-xl px-6 py-5">
    <p class="text-[13px] text-on-surface-variant/70">
      <!-- Le bouton est desactive tant que rien n'a bouge : sans ce troisieme
           cas, la phrase promettait un enregistrement impossible a declencher. -->
      {#if !selectedId}
        {m.lv_presets_custom()}
      {:else if !dirty}
        {m.lv_presets_already_saved()}
      {:else}
        {m.lv_presets_save_hint()}
      {/if}
    </p>
    <button
      type="button"
      onclick={onsave}
      disabled={disabled || !dirty || saving}
      class="shrink-0 px-6 py-3 bg-primary hover:bg-primary/90 text-on-primary text-[13px] font-medium rounded-lg shadow-md shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
    >
      <Papicon icon="Check" size={16} />
      {m.lv_presets_save()}
    </button>
  </div>
</div>
