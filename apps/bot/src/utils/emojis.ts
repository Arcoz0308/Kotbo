// ─────────────────────────────────────────────────────────────
// Kotbo Custom Emoji System
// ─────────────────────────────────────────────────────────────
// To use branded custom emojis (like RaidProtect), upload the
// emoji images to a dedicated Discord server and replace the
// Unicode fallbacks below with <:name:ID> format.
//
// Example: success: '<:ktb_check:1234567890>'
// ─────────────────────────────────────────────────────────────

export const E = {
  // ─── Status ───
  success: '<:ktb_check:1351282105460060160>',
  error: '<:ktb_cross:1351282117212524574>',
  warning: '<:ktb_warn:1351282128671375431>',
  info: '<:ktb_info:1351282140004376576>',
  loading: '⏳',

  // ─── UI Elements ───
  arrow: '<:ktb_arrow:1351282151425216512>',
  dot: '<:ktb_dot:1351282162330583040>',
  line: '━',
  empty: '​',
  bullet: '▸',

  // ─── Ranking ───
  rank1: '<:ktb_gold:1351282173701259264>',
  rank2: '<:ktb_silver:1351282184883265536>',
  rank3: '<:ktb_bronze:1351282196044517376>',

  // ─── Features ───
  moderation: '<:ktb_mod:1351282207306203136>',
  stats: '<:ktb_stats:1351282218580766720>',
  trophy: '<:ktb_trophy:1351282229829926912>',
  profile: '<:ktb_profile:1351282240898740224>',
  xp: '<:ktb_xp:1351282251938332672>',
  level: '<:ktb_level:1351282263019708416>',
  messages: '<:ktb_msg:1351282274126270464>',
  voice: '<:ktb_voice:1351282285282930688>',
  coins: '<:ktb_coins:1351282296388984832>',
  calendar: '<:ktb_cal:1351282307511152640>',
  clock: '<:ktb_clock:1351282318672199680>',
  ticket: '<:ktb_ticket:1351282329795862528>',
  news: '<:ktb_news:1351282340818300928>',
  settings: '<:ktb_settings:1351282351870070784>',
  shield: '<:ktb_shield:1351282362888675328>',
  star: '<:ktb_star:1351282373853609984>',
  fire: '<:ktb_fire:1351282384900009984>',
  crown: '<:ktb_crown:1351282395901386752>',
  link: '<:ktb_link:1351282406953861120>',
  lock: '<:ktb_lock:1351282417980235776>',
  unlock: '<:ktb_unlock:1351282429019750400>',
  ban: '<:ktb_ban:1351282440080760832>',
  mute: '<:ktb_mute:1351282451118878720>',
  kick: '<:ktb_kick:1351282462184243200>',

  // ─── Platforms ───
  youtube: '<:ktb_yt:1351282473254248448>',
  twitch: '<:ktb_twitch:1351282484303298560>',

  // ─── Presence ───
  online: '<:ktb_online:1351282495369969664>',
  idle: '<:ktb_idle:1351282506430570496>',
  dnd: '<:ktb_dnd:1351282517520670720>',
  offline: '<:ktb_offline:1351282528576004096>',

  // ─── Progress Bar (3-part) ───
  barFullL: '<:ktb_fl:1351282539607867392>',
  barFullM: '<:ktb_fm:1351282550630830080>',
  barFullR: '<:ktb_fr:1351282561696620544>',
  barEmptyL: '<:ktb_el:1351282572787458048>',
  barEmptyM: '<:ktb_em:1351282583823523840>',
  barEmptyR: '<:ktb_er:1351282594855206912>',

  // ─── Branding ───
  kotbo: '<:ktb_logo:1351282605928271872>',
} as const;

// ─── Fallback Unicode Emojis ───
// Used when custom emojis are not accessible (DMs, other servers)
const UNICODE_FALLBACKS: Record<string, string> = {
  success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️', loading: '⏳',
  arrow: '▸', dot: '◈', line: '━', empty: '​', bullet: '▸',
  rank1: '🥇', rank2: '🥈', rank3: '🥉',
  moderation: '🛡️', stats: '📊', trophy: '🏆', profile: '👤',
  xp: '✨', level: '⭐', messages: '💬', voice: '🎙️', coins: '🪙',
  calendar: '📅', clock: '🕐', ticket: '🎫', news: '📰',
  settings: '⚙️', shield: '🛡️', star: '⭐', fire: '🔥', crown: '👑',
  link: '🔗', lock: '🔒', unlock: '🔓',
  ban: '🔨', mute: '🔇', kick: '👢',
  youtube: '▶️', twitch: '🟣',
  online: '🟢', idle: '🟡', dnd: '🔴', offline: '⚫',
  barFullL: '▰', barFullM: '▰', barFullR: '▰',
  barEmptyL: '▱', barEmptyM: '▱', barEmptyR: '▱',
  kotbo: '🔮',
};

export function rankEmoji(rank: number): string {
  if (rank === 1) return E.rank1;
  if (rank === 2) return E.rank2;
  if (rank === 3) return E.rank3;
  return `**#${rank}**`;
}

export function presenceEmoji(status: string): string {
  switch (status) {
    case 'online': return E.online;
    case 'idle': return E.idle;
    case 'dnd': return E.dnd;
    default: return E.offline;
  }
}

export function buildProgressBar(percent: number, size = 10): string {
  const filled = Math.round((percent / 100) * size);
  const empty = size - filled;

  if (size <= 3) {
    return '▰'.repeat(filled) + '▱'.repeat(empty);
  }

  let bar = '';
  for (let i = 0; i < size; i++) {
    if (i === 0) bar += i < filled ? E.barFullL : E.barEmptyL;
    else if (i === size - 1) bar += i < filled ? E.barFullR : E.barEmptyR;
    else bar += i < filled ? E.barFullM : E.barEmptyM;
  }
  return bar;
}

export function feedStatusEmoji(status: boolean): string {
  return status ? E.online : E.offline;
}

export function categoryEmoji(category: string): string {
  const c = category?.toLowerCase() || '';
  if (c.includes('youtube')) return E.youtube;
  if (c.includes('twitch')) return E.twitch;
  return E.news;
}
