<script lang="ts">
  import Papicon from '../Papicon.svelte';
  import FormSelect from '../FormSelect.svelte';
  import SearchableSelect from '../SearchableSelect.svelte';
  import ToggleSwitch from '../ToggleSwitch.svelte';

  let {
    features = $bindable([]),
    guildSettings = $bindable({} as any),
    availableChannels = [],
    availableRoles = [],
    onSaveGlobal = () => {},
    onSaveFeature = (_key: string) => {},
  } = $props();

  const globalChannelFields = [
    { key: 'logChannelId', label: 'Salon de Logs', desc: 'Salon principal pour les logs du bot' },
    { key: 'regulationChannelId', label: 'Salon Règlement', desc: 'Publication du règlement' },
    { key: 'meetingAnnouncementChannelId', label: 'Annonces Réunions', desc: 'Annonces des réunions staff' },
    { key: 'meetingVoiceChannelId', label: 'Vocal Réunions', desc: 'Salon vocal par défaut' },
    { key: 'digestChannelId', label: 'Salon Digest', desc: 'Publication du digest de news' },
    { key: 'publicChannelId', label: 'Salon Public', desc: 'Salon public général' },
    { key: 'configChannelId', label: 'Salon Config', desc: 'Salon de configuration interne' },
  ];

  const globalRoleFields = [
    { key: 'moderatorRoleId', label: 'Rôle Modérateur', desc: 'Rôle de base pour la modération' },
    { key: 'baseStaffRoleId', label: 'Rôle Staff Base', desc: 'Rôle de base du staff' },
    { key: 'testStaffRoleId', label: 'Rôle Staff Test', desc: 'Rôle pour les membres en période d\'essai' },
  ];
</script>

<div class="space-y-8 animate-in fade-in duration-500">
  <!-- Paramètres globaux -->
  <div class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-8">
    <div class="flex justify-between items-center">
      <div>
        <h3 class="text-xl font-black">Paramètres Globaux</h3>
        <p class="text-xs text-on-surface-variant/50 mt-1">Canaux et rôles utilisés de manière transversale.</p>
      </div>
      <button onclick={onSaveGlobal} class="px-7 py-3 bg-primary text-on-primary font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
        Enregistrer Global
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
      <!-- Salons globaux -->
      <div class="space-y-5">
        <h4 class="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2"><Papicon icon="Hash" size={14} /> Salons Discord</h4>
        <div class="space-y-4">
          {#each globalChannelFields as field}
            <div class="space-y-1.5">
              <label for="channel-{field.key}" class="text-[10px] font-bold text-on-surface-variant/60 ml-2">{field.label}</label>
              <SearchableSelect id="channel-{field.key}" bind:value={guildSettings[field.key]} options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))} placeholder="— Aucun —" className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all" />
              <p class="text-[9px] text-on-surface-variant/40 ml-2">{field.desc}</p>
            </div>
          {/each}
        </div>
      </div>

      <!-- Rôles globaux -->
      <div class="space-y-5">
        <h4 class="text-[10px] font-black uppercase tracking-widest text-secondary flex items-center gap-2"><Papicon icon="Shield" size={14} /> Rôles Discord</h4>
        <div class="space-y-4">
          {#each globalRoleFields as field}
            <div class="space-y-1.5">
              <label for="role-{field.key}" class="text-[10px] font-bold text-on-surface-variant/60 ml-2">{field.label}</label>
              <SearchableSelect id="role-{field.key}" bind:value={guildSettings[field.key]} options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} placeholder="— Aucun —" className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/30 transition-all" />
              <p class="text-[9px] text-on-surface-variant/40 ml-2">{field.desc}</p>
            </div>
          {/each}
        </div>

        <!-- Toggles globaux -->
        <div class="mt-6 space-y-4">
          <h4 class="text-[10px] font-black uppercase tracking-widest text-tertiary flex items-center gap-2"><Papicon icon="ToggleRight" size={14} /> Intégrations</h4>
          <div class="bg-surface-container-high/20 rounded-4xl border border-outline-variant/5 p-5 space-y-3">
            {#each [
              { key: 'youtubeEnabled', label: 'YouTube', desc: 'Vidéos & shorts' },
              { key: 'digestEnabled', label: 'Digest RSS', desc: 'News périodiques' },
              { key: 'translationEnabled', label: 'Auto-traduction', desc: 'Contenus' },
              { key: 'codePoliceEnabled', label: 'Code Police', desc: 'Audit code' },
              { key: 'dailyAlgoEnabled', label: 'Daily Algo', desc: 'Défis quotidiens' },
              { key: 'githubReleasesEnabled', label: 'GitHub Releases', desc: 'Notifications releases' },
            ] as toggle}
              <div class="flex items-center justify-between py-1">
                <div><p class="text-sm font-bold">{toggle.label}</p><p class="text-[10px] text-on-surface-variant/50">{toggle.desc}</p></div>
                <ToggleSwitch checked={guildSettings[toggle.key]} onToggle={(v) => { guildSettings[toggle.key] = v; guildSettings = {...guildSettings}; }} />
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Canaux & Rôles par feature -->
  <div class="bg-surface-container-low/30 border border-outline-variant/10 p-8 rounded-[2.5rem] space-y-6">
    <h3 class="text-xl font-black">Par Fonctionnalité</h3>
    <p class="text-xs text-on-surface-variant/50">Salon et rôle spécifiques assignés à chaque module.</p>

    <div class="overflow-hidden rounded-4xl border border-outline-variant/5">
      <table class="w-full text-left border-collapse">
        <thead class="bg-surface-container-high/40 text-[10px] font-black uppercase tracking-widest text-on-surface-variant/60">
          <tr>
            <th class="px-5 py-4">Module</th>
            <th class="px-5 py-4">Salon Principal</th>
            <th class="px-5 py-4">Rôle Requis</th>
            <th class="px-5 py-4">Rôle Notification</th>
            <th class="px-5 py-4 text-center">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-outline-variant/5">
          {#each features as feature, idx}
            <tr class="hover:bg-surface-container-high/20 transition-colors">
              <td class="px-5 py-4"><span class="text-sm font-bold">{feature.featureName}</span></td>
              <td class="px-5 py-4">
                <SearchableSelect bind:value={features[idx].channelId} options={availableChannels.map(c => ({ id: c.id, name: `#${c.name}` }))} placeholder="— Aucun —" className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-3 py-2 text-xs" />
              </td>
              <td class="px-5 py-4">
                <SearchableSelect bind:value={features[idx].requiredRoleId} options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} placeholder="— Aucun —" className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-3 py-2 text-xs" />
              </td>
              <td class="px-5 py-4">
                <SearchableSelect bind:value={features[idx].notificationRoleId} options={availableRoles.map(r => ({ id: r.id, name: `@${r.name}` }))} placeholder="— Aucun —" className="w-full bg-surface-container-high/40 border border-outline-variant/10 rounded-xl px-3 py-2 text-xs" />
              </td>
              <td class="px-5 py-4 text-center">
                <button onclick={() => onSaveFeature(feature.featureKey)} class="px-4 py-1.5 bg-on-surface text-surface text-[9px] font-black uppercase tracking-widest rounded-lg hover:scale-105 transition-transform">
                  Sauver
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

