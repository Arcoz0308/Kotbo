import { createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import prisma from '../../utils/db.js';
import { ensureCanvasFonts, canvasFont } from '../../utils/canvasFonts.js';

// ─────────────────────────────────────────────────────────────
// Kotbo Design System — Canvas Constants
// ─────────────────────────────────────────────────────────────
const BRAND = {
  bg1: '#07090e',
  bg2: '#0b0f19',
  bg3: '#101524',
  card: '#131929',
  cardAlt: '#182035',
  border: 'rgba(88, 101, 242, 0.18)',
  blurple: '#5865f2',
  green: '#57f287',
  pink: '#eb459e',
  yellow: '#fee75c',
  red: '#ed4245',
  cyan: '#5bc0eb',
  textPrimary: '#ffffff',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textDark: '#475569',
  glowBlurple: 'rgba(88, 101, 242, 0.15)',
  glowGreen: 'rgba(87, 242, 135, 0.10)',
  glowPink: 'rgba(235, 69, 158, 0.10)',
};

// ─────────────────────────────────────────────────────────────
// Shared Canvas Utilities
// ─────────────────────────────────────────────────────────────
function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, stroke?: string) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function drawBackground(ctx: SKRSContext2D, W: number, H: number) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, BRAND.bg1);
  bg.addColorStop(0.5, BRAND.bg2);
  bg.addColorStop(1, BRAND.bg1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
}

function drawGlows(ctx: SKRSContext2D, W: number, H: number) {
  const glow1 = ctx.createRadialGradient(W * 0.15, H * 0.12, 0, W * 0.15, H * 0.12, W * 0.4);
  glow1.addColorStop(0, BRAND.glowBlurple);
  glow1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.85, H * 0.85, 0, W * 0.85, H * 0.85, W * 0.35);
  glow2.addColorStop(0, BRAND.glowGreen);
  glow2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);
}

function drawTopAccentBar(ctx: SKRSContext2D, W: number) {
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, BRAND.blurple);
  bar.addColorStop(0.4, '#7b68ee');
  bar.addColorStop(0.7, BRAND.green);
  bar.addColorStop(1, BRAND.blurple);
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, 4);

  const barGlow = ctx.createLinearGradient(0, 4, 0, 24);
  barGlow.addColorStop(0, 'rgba(88, 101, 242, 0.3)');
  barGlow.addColorStop(1, 'rgba(88, 101, 242, 0)');
  ctx.fillStyle = barGlow;
  ctx.fillRect(0, 4, W, 20);
}

function drawBottomBar(ctx: SKRSContext2D, W: number, H: number) {
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, 'rgba(88, 101, 242, 0)');
  bar.addColorStop(0.3, 'rgba(88, 101, 242, 0.45)');
  bar.addColorStop(0.7, 'rgba(87, 242, 135, 0.45)');
  bar.addColorStop(1, 'rgba(87, 242, 135, 0)');
  ctx.fillStyle = bar;
  ctx.fillRect(0, H - 3, W, 3);
}

function drawFooter(ctx: SKRSContext2D, W: number, H: number, left: string, right: string) {
  ctx.fillStyle = BRAND.textMuted;
  ctx.font = canvasFont(12, 'normal');
  ctx.textAlign = 'left';
  ctx.fillText(left, 40, H - 18);
  ctx.textAlign = 'right';
  ctx.fillText(right, W - 40, H - 18);
  ctx.textAlign = 'left';
}

function drawKPI(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, value: string, label: string, color: string) {
  roundRect(ctx, x + 2, y + 4, w, h, 14, 'rgba(0,0,0,0.4)');
  roundRect(ctx, x, y, w, h, 14, BRAND.card, BRAND.border);

  const leftBar = ctx.createLinearGradient(x, y, x, y + h);
  leftBar.addColorStop(0, color);
  leftBar.addColorStop(1, 'rgba(0,0,0,0.05)');
  roundRect(ctx, x, y, 4, h, 2, leftBar);

  ctx.fillStyle = BRAND.textPrimary;
  ctx.font = canvasFont(26, 'bold');
  ctx.fillText(value, x + 18, y + h * 0.54);

  ctx.fillStyle = BRAND.textMuted;
  ctx.font = canvasFont(12, 'normal');
  ctx.fillText(label, x + 18, y + h * 0.82);
}

function drawSeparatorLine(ctx: SKRSContext2D, x: number, y: number, w: number) {
  const sep = ctx.createLinearGradient(x, 0, x + w, 0);
  sep.addColorStop(0, 'rgba(88, 101, 242, 0.4)');
  sep.addColorStop(0.5, 'rgba(87, 242, 135, 0.2)');
  sep.addColorStop(1, 'rgba(88, 101, 242, 0)');
  ctx.fillStyle = sep;
  ctx.fillRect(x, y, w, 1.5);
}

async function drawCircularAvatar(ctx: SKRSContext2D, url: string, x: number, y: number, radius: number, fallbackName?: string) {
  try {
    const img = await loadImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  } catch {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = BRAND.blurple;
    ctx.fill();
    if (fallbackName) {
      ctx.fillStyle = '#ffffff';
      ctx.font = canvasFont(Math.round(radius), 'bold');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fallbackName.charAt(0).toUpperCase(), x, y);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }
}

// ─────────────────────────────────────────────────────────────
// generateStatsImage — News/RSS Stats
// ─────────────────────────────────────────────────────────────
export async function generateStatsImage(guildId: string): Promise<Buffer> {
  ensureCanvasFonts();
  const W = 1000, H = 650;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawGlows(ctx, W, H);
  drawTopAccentBar(ctx, W);

  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);

  const feeds = await prisma.feed.findMany({
    where: { guildId },
    include: { items: { where: { status: 'APPROVED' } }, subscribers: true },
    orderBy: { name: 'asc' },
  });

  const totalApproved = feeds.reduce((s, f) => s + f.items.length, 0);
  const todayApproved = feeds.reduce((s, f) => s + f.items.filter(i => i.createdAt >= today).length, 0);
  const weekApproved = feeds.reduce((s, f) => s + f.items.filter(i => i.createdAt >= weekAgo).length, 0);
  const totalSubs = feeds.reduce((s, f) => s + f.subscribers.length, 0);
  const activeFeeds = feeds.filter(f => f.enabled).length;

  // Header
  ctx.fillStyle = BRAND.textPrimary;
  ctx.font = canvasFont(30, 'bold');
  ctx.fillText('Kotbo News — Statistiques', 40, 48);

  ctx.fillStyle = BRAND.textMuted;
  ctx.font = canvasFont(13, 'normal');
  ctx.fillText(now.toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }), 40, 70);

  drawSeparatorLine(ctx, 40, 84, W - 80);

  // KPIs
  const cards = [
    { label: "Aujourd'hui", value: String(todayApproved), color: BRAND.green },
    { label: 'Cette semaine', value: String(weekApproved), color: BRAND.blurple },
    { label: 'Total validées', value: String(totalApproved), color: BRAND.yellow },
    { label: 'Abonnés DM', value: String(totalSubs), color: BRAND.pink },
    { label: 'Flux actifs', value: `${activeFeeds}/${feeds.length}`, color: BRAND.cyan },
  ];

  const cardW = 168, cardH = 90, cardY = 100, cardGap = 16;
  const totalCardsW = cards.length * cardW + (cards.length - 1) * cardGap;
  const cardStartX = Math.floor((W - totalCardsW) / 2);

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const x = cardStartX + i * (cardW + cardGap);
    drawKPI(ctx, x, cardY, cardW, cardH, c.value, c.label, c.color);
  }

  const sectionY = cardY + cardH + 20;
  drawSeparatorLine(ctx, 40, sectionY, W - 80);

  // Top Feeds Chart
  const chartX = 40, chartY = sectionY + 28, chartW = 560;
  const barH = 26, barGap = 10;

  ctx.fillStyle = BRAND.textSecondary;
  ctx.font = canvasFont(16, 'bold');
  ctx.fillText('Top Flux RSS', chartX, chartY);

  const topFeeds = [...feeds].sort((a, b) => b.items.length - a.items.length).slice(0, 7);
  const maxVal = Math.max(...topFeeds.map(f => f.items.length), 1);

  for (let i = 0; i < topFeeds.length; i++) {
    const feed = topFeeds[i];
    const y = chartY + 22 + i * (barH + barGap);
    const barMaxW = chartW - 200;
    const barW = Math.max(6, (feed.items.length / maxVal) * barMaxW);

    ctx.fillStyle = BRAND.textMuted;
    ctx.font = canvasFont(13, 'normal');
    ctx.fillText(truncate(feed.name, 22), chartX, y + barH - 8);

    roundRect(ctx, chartX + 180, y, barMaxW, barH, 8, BRAND.bg3);

    const grad = ctx.createLinearGradient(chartX + 180, 0, chartX + 180 + barW, 0);
    grad.addColorStop(0, BRAND.blurple);
    grad.addColorStop(1, BRAND.green);
    roundRect(ctx, chartX + 180, y, barW, barH, 8, grad);

    ctx.fillStyle = BRAND.textPrimary;
    ctx.font = canvasFont(13, 'bold');
    ctx.fillText(String(feed.items.length), chartX + 180 + barW + 10, y + barH - 8);
  }

  // Subscribers Panel
  const rightX = 640, rightY = sectionY + 28;
  roundRect(ctx, rightX - 16, rightY - 16, W - rightX + 16 - 24, 316, 16, BRAND.card, BRAND.border);

  ctx.fillStyle = BRAND.textSecondary;
  ctx.font = canvasFont(16, 'bold');
  ctx.fillText('Abonnés par flux', rightX, rightY);

  const topBySubs = [...feeds].sort((a, b) => b.subscribers.length - a.subscribers.length).slice(0, 8);
  for (let i = 0; i < topBySubs.length; i++) {
    const feed = topBySubs[i];
    const y = rightY + 26 + i * (barH + barGap + 2);

    ctx.fillStyle = BRAND.textMuted;
    ctx.font = canvasFont(13, 'normal');
    ctx.fillText(truncate(feed.name, 20), rightX, y + 16);
    const subCount = feed.subscribers.length;
    const dotColor = subCount > 5 ? BRAND.green : subCount > 0 ? BRAND.yellow : BRAND.textDark;

    ctx.beginPath();
    ctx.arc(rightX + 210, y + 12, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    ctx.fillStyle = BRAND.textSecondary;
    ctx.font = canvasFont(14, 'bold');
    ctx.fillText(String(subCount), rightX + 222, y + 17);
  }

  drawBottomBar(ctx, W, H);
  drawFooter(ctx, W, H, 'Kotbo • RSS & YouTube', `${activeFeeds} flux actifs  •  ${totalApproved} articles`);

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// generateWeeklyRecapImage — Terminal-Style Weekly Recap
// ─────────────────────────────────────────────────────────────
export async function generateWeeklyRecapImage(guildId: string, items: any[]): Promise<Buffer> {
  ensureCanvasFonts();
  const itemX = 50;
  const itemW = 900;
  const itemH = 110;
  const itemGap = 25;
  const headerH = 210;
  const footerH = 60;

  const W = 1000;
  const H = Math.max(600, headerH + items.length * (itemH + itemGap) + footerH);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.012)';
  for (let i = 0; i < H; i += 4) ctx.fillRect(0, i, W, 1);

  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, '#1c1f26');
  topBar.addColorStop(1, '#11141a');
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 40);

  const colors = ['#ff5f56', '#ffbd2e', '#27c93f'];
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(25 + i * 20, 20, 6, 0, Math.PI * 2);
    ctx.fillStyle = colors[i];
    ctx.fill();
  }

  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = BRAND.green;
  ctx.fillText('user@kotbo', 50, 80);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(':', 155, 80);
  ctx.fillStyle = BRAND.blurple;
  ctx.fillText('~/weekly-news', 170, 80);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('$ recap --format=clean --top=5', 300, 80);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px monospace';
  ctx.fillText('> EXECUTING WEEKLY RECAP', 50, 140);

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  ctx.fillStyle = BRAND.textMuted;
  ctx.font = '16px monospace';
  ctx.fillText(`[TIMESTAMP: ${dateStr.toUpperCase()}]`, 50, 170);

  let currentY = headerH;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const y = currentY;
    currentY += itemH + itemGap;

    ctx.strokeStyle = 'rgba(88, 101, 242, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(itemX, y, itemW, itemH);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(itemX, y, itemW, itemH);

    const accentColor = i === 0 ? BRAND.yellow : i === 1 ? '#c9d1d9' : i === 2 ? '#cd7f32' : BRAND.blurple;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(itemX + 20, y + 32, 45, 40);
    ctx.strokeStyle = accentColor;
    ctx.strokeRect(itemX + 20, y + 32, 45, 40);

    ctx.fillStyle = accentColor;
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, itemX + 42, y + 58);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    const title = item.titleTranslated ?? item.title;
    ctx.fillText(truncate(title, 65), itemX + 85, y + 42);

    ctx.fillStyle = BRAND.textMuted;
    ctx.font = '14px monospace';
    const sourceLabel = `SOURCE: ${item.feed?.name ?? 'UNKNOWN'} | TAGS: ${item.feed?.category ?? 'GENERAL'}`;
    ctx.fillText(sourceLabel, itemX + 85, y + 75);

    if (item.interestScore) {
      const score = Math.round(item.interestScore * 100);
      const scoreColor = score > 80 ? BRAND.green : score > 50 ? BRAND.yellow : BRAND.red;

      ctx.fillStyle = BRAND.textDark;
      ctx.fillRect(itemX + 85, y + 90, 200, 4);
      ctx.fillStyle = scoreColor;
      ctx.fillRect(itemX + 85, y + 90, (score / 100) * 200, 4);

      ctx.fillStyle = scoreColor;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`${score}% RELEVANCE`, itemX + 300, y + 95);
    }
  }

  ctx.fillStyle = '#11141a';
  ctx.fillRect(0, H - footerH, W, footerH);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - footerH);
  ctx.lineTo(W, H - footerH);
  ctx.stroke();

  const footerTextY = H - (footerH / 2) + 5;
  ctx.fillStyle = BRAND.textMuted;
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`KOTBO_OS_v2.0 [SUCCESS] — ${items.length} items parsed.`, 50, footerTextY);
  ctx.textAlign = 'right';
  ctx.fillText('RECAP_GENERATOR_READY', W - 50, footerTextY);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// generateMemberStatsImage — Member Activity Profile
// ─────────────────────────────────────────────────────────────
export async function generateMemberStatsImage(
  userName: string,
  periodDays: number,
  stats: { totalMessages: number; totalVoice: number; activeDays: number; peakDayMessages: number },
  dailyData: { date: string; messages: number; voice: number }[],
): Promise<Buffer> {
  ensureCanvasFonts();
  const W = 800, H = 520;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawGlows(ctx, W, H);
  drawTopAccentBar(ctx, W);

  ctx.fillStyle = BRAND.textPrimary;
  ctx.font = canvasFont(26, 'bold');
  ctx.fillText(`Profil d'activité · ${truncate(userName, 24)}`, 40, 46);

  ctx.fillStyle = BRAND.textMuted;
  ctx.font = canvasFont(14, 'normal');
  ctx.fillText(`Les ${periodDays} derniers jours`, 40, 68);

  // KPIs
  const kpis = [
    { label: 'Messages', value: stats.totalMessages.toLocaleString('fr-FR'), color: BRAND.blurple },
    { label: 'Vocal (min)', value: stats.totalVoice.toLocaleString('fr-FR'), color: BRAND.green },
    { label: 'Jours actifs', value: String(stats.activeDays), color: BRAND.yellow },
  ];

  const kpiW = 200, kpiH = 75, kpiGap = 20;
  for (let i = 0; i < kpis.length; i++) {
    const k = kpis[i];
    drawKPI(ctx, 40 + i * (kpiW + kpiGap), 96, kpiW, kpiH, k.value, k.label, k.color);
  }

  // Chart (Shifted right for Y axis labels)
  const chartX = 75, chartY = 210, chartW = W - 115, chartH = 220;
  roundRect(ctx, chartX, chartY, chartW, chartH, 12, BRAND.card, BRAND.border);

  if (dailyData.length > 0) {
    const maxVal = Math.max(...dailyData.map(d => Math.max(d.messages, d.voice)), 1);
    const pad = 16;

    // Grid lines & Y Axis labels
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    ctx.fillStyle = BRAND.textMuted;
    ctx.font = canvasFont(10, 'normal');
    ctx.textAlign = 'right';

    for (let i = 0; i < 5; i++) {
      const y = chartY + pad + ((chartH - pad * 2) * i) / 4;
      ctx.beginPath(); 
      ctx.moveTo(chartX + pad, y); 
      ctx.lineTo(chartX + chartW - pad, y); 
      ctx.stroke();

      const val = Math.round(maxVal - (maxVal * i) / 4);
      ctx.fillText(val.toLocaleString('fr-FR'), chartX - 10, y + 4);
    }
    ctx.textAlign = 'left';

    // Voice area (green, semi-transparent fill)
    ctx.beginPath();
    ctx.moveTo(chartX + pad, chartY + chartH - pad);
    for (let i = 0; i < dailyData.length; i++) {
      const x = chartX + pad + i * ((chartW - pad * 2) / (dailyData.length - 1 || 1));
      const y = chartY + chartH - pad - (dailyData[i].voice / maxVal) * (chartH - pad * 2);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(chartX + chartW - pad, chartY + chartH - pad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(87, 242, 135, 0.06)';
    ctx.fill();

    // Voice line
    ctx.beginPath();
    for (let i = 0; i < dailyData.length; i++) {
      const x = chartX + pad + i * ((chartW - pad * 2) / (dailyData.length - 1 || 1));
      const y = chartY + chartH - pad - (dailyData[i].voice / maxVal) * (chartH - pad * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = BRAND.green;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Messages area (blurple, semi-transparent fill)
    ctx.beginPath();
    ctx.moveTo(chartX + pad, chartY + chartH - pad);
    for (let i = 0; i < dailyData.length; i++) {
      const x = chartX + pad + i * ((chartW - pad * 2) / (dailyData.length - 1 || 1));
      const y = chartY + chartH - pad - (dailyData[i].messages / maxVal) * (chartH - pad * 2);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(chartX + chartW - pad, chartY + chartH - pad);
    ctx.closePath();
    ctx.fillStyle = 'rgba(88, 101, 242, 0.06)';
    ctx.fill();

    // Messages line
    ctx.beginPath();
    for (let i = 0; i < dailyData.length; i++) {
      const x = chartX + pad + i * ((chartW - pad * 2) / (dailyData.length - 1 || 1));
      const y = chartY + chartH - pad - (dailyData[i].messages / maxVal) * (chartH - pad * 2);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = BRAND.blurple;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // X Axis month/day labels ("les mois" - ticks)
    ctx.fillStyle = BRAND.textMuted;
    ctx.font = canvasFont(11, 'normal');
    ctx.textAlign = 'center';

    const labelCount = Math.min(5, dailyData.length);
    const labelStep = Math.max(1, Math.floor(dailyData.length / (labelCount - 1)));

    for (let i = 0; i < labelCount; i++) {
      const idx = Math.min(i * labelStep, dailyData.length - 1);
      const dataPoint = dailyData[idx];
      if (dataPoint) {
        const x = chartX + pad + idx * ((chartW - pad * 2) / (dailyData.length - 1 || 1));
        const dateParts = dataPoint.date.split('-');
        if (dateParts.length === 3) {
          const d = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2]));
          const formattedDate = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
          ctx.fillText(formattedDate, x, chartY + chartH + 8);
        }
      }
    }
    ctx.textAlign = 'left';

    // Legend
    ctx.fillStyle = BRAND.blurple;
    roundRect(ctx, chartX + chartW - 200, chartY + 12, 8, 8, 2, BRAND.blurple);
    ctx.fillStyle = BRAND.textSecondary;
    ctx.font = canvasFont(11, 'normal');
    ctx.fillText('Messages', chartX + chartW - 188, chartY + 20);

    ctx.fillStyle = BRAND.green;
    roundRect(ctx, chartX + chartW - 110, chartY + 12, 8, 8, 2, BRAND.green);
    ctx.fillStyle = BRAND.textSecondary;
    ctx.fillText('Vocal', chartX + chartW - 98, chartY + 20);
  } else {
    ctx.fillStyle = BRAND.textMuted;
    ctx.font = canvasFont(16, 'normal');
    ctx.textAlign = 'center';
    ctx.fillText('Aucune donnée pour cette période', chartX + chartW / 2, chartY + chartH / 2);
    ctx.textAlign = 'left';
  }

  drawBottomBar(ctx, W, H);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// generateLeaderboardImage — Top 10 Leaderboard
// ─────────────────────────────────────────────────────────────
export async function generateLeaderboardImage(
  topMembers: { name: string; score: number; avatarUrl?: string | null; level?: number }[],
  type: 'messages' | 'voice' | 'mixed' | 'xp',
  periodDays: number,
): Promise<Buffer> {
  ensureCanvasFonts();
  const W = 720, H = 820;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawGlows(ctx, W, H);

  const themeColor = type === 'messages' ? BRAND.blurple : type === 'voice' ? BRAND.green : type === 'xp' ? BRAND.pink : BRAND.yellow;

  // Accent bar with theme color
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, themeColor);
  bar.addColorStop(1, BRAND.blurple);
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, 4);

  // Title
  ctx.fillStyle = BRAND.textPrimary;
  ctx.font = canvasFont(30, 'bold');
  const typeLabel = type === 'messages' ? 'Messages' : type === 'voice' ? 'Vocal' : type === 'xp' ? 'XP & Niveaux' : 'Activité Mixte';
  ctx.fillText(`Top 10 — ${typeLabel}`, 40, 55);

  ctx.fillStyle = BRAND.textMuted;
  ctx.font = canvasFont(15, 'normal');
  const subTitle = type === 'xp' ? "Classement global d'expérience" : `Les ${periodDays} derniers jours`;
  ctx.fillText(subTitle, 40, 80);

  drawSeparatorLine(ctx, 40, 98, W - 80);

  const startY = 116;
  const rowH = 65;
  const maxScore = Math.max(...topMembers.map(m => m.score), 1);

  const rankColors = [BRAND.yellow, '#c9d1d9', '#cd7f32'];

  for (let i = 0; i < topMembers.length; i++) {
    const member = topMembers[i];
    const y = startY + i * rowH;

    // Row card style - Top 3 has custom gradient glow highlight
    const rowBg = i < 3 ? 'rgba(22, 28, 40, 0.72)' : 'rgba(22, 28, 40, 0.35)';
    const rowBorder = i < 3 ? rankColors[i] + '40' : BRAND.border;
    roundRect(ctx, 30, y, W - 60, 54, 10, rowBg, rowBorder);

    // Left color bar for top ranks
    if (i < 3) {
      roundRect(ctx, 30, y, 4, 54, 2, rankColors[i]);
    }

    // Rank badge
    const rankColor = i < 3 ? rankColors[i] : BRAND.cardAlt;
    const rankTextColor = i < 3 ? '#000000' : BRAND.textSecondary;

    roundRect(ctx, 44, y + 11, 32, 32, 8, rankColor);
    ctx.fillStyle = rankTextColor;
    ctx.font = canvasFont(15, 'bold');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${i + 1}`, 60, y + 27);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // Avatar with ranking ring
    const avatarX = 108, avatarY = y + 27;
    if (i < 3) {
      ctx.beginPath();
      ctx.arc(avatarX, avatarY, 20, 0, Math.PI * 2);
      ctx.strokeStyle = rankColors[i];
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    await drawCircularAvatar(ctx, member.avatarUrl || '', avatarX, avatarY, 18, member.name);

    // Name / Level
    ctx.fillStyle = BRAND.textPrimary;
    ctx.font = canvasFont(15, 'bold');
    const displayName = member.level !== undefined ? `${member.name}  ᴸᵛ·${member.level}` : member.name;
    ctx.fillText(truncate(displayName, 22), 138, y + 24);

    // Progress bar
    const barX = 340, barMaxW = 200;
    const barW = Math.max(6, (member.score / maxScore) * barMaxW);

    roundRect(ctx, barX, y + 22, barMaxW, 10, 5, 'rgba(255,255,255,0.04)');
    
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, themeColor);
    grad.addColorStop(1, BRAND.green);
    roundRect(ctx, barX, y + 22, barW, 10, 5, grad);

    // Score
    ctx.fillStyle = BRAND.textSecondary;
    ctx.font = canvasFont(14, 'bold');
    ctx.textAlign = 'right';
    let scoreFmt: string;
    if (type === 'voice') scoreFmt = `${Math.floor(member.score / 60)}h ${member.score % 60}m`;
    else if (type === 'xp') scoreFmt = `${member.score.toLocaleString('fr-FR')} XP`;
    else scoreFmt = member.score.toLocaleString('fr-FR');
    ctx.fillText(scoreFmt, W - 48, y + 32);
    ctx.textAlign = 'left';
  }

  drawBottomBar(ctx, W, H);
  drawFooter(ctx, W, H, 'Kotbo Analytics', `${topMembers.length} membres classés`);

  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// generateServerStatsImage — Server Overview
// ─────────────────────────────────────────────────────────────
export async function generateServerStatsImage(
  guildName: string,
  periodDays: number,
  stats: { totalMessages: number; totalVoice: number; newMembers: number; activeMembers: number; totalMembers: number },
): Promise<Buffer> {
  ensureCanvasFonts();
  const W = 800, H = 480;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawGlows(ctx, W, H);

  // Accent bar (blurple → pink)
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, BRAND.blurple);
  topBar.addColorStop(1, BRAND.pink);
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 4);

  ctx.fillStyle = BRAND.textPrimary;
  ctx.font = canvasFont(28, 'bold');
  ctx.fillText(`Stats Serveur · ${truncate(guildName, 28)}`, 40, 50);

  ctx.fillStyle = BRAND.textMuted;
  ctx.font = canvasFont(15, 'normal');
  ctx.fillText(`Les ${periodDays} derniers jours`, 40, 76);

  drawSeparatorLine(ctx, 40, 92, W - 80);

  // KPIs — 2x2 grid
  const kpis = [
    { label: 'Messages', value: stats.totalMessages.toLocaleString('fr-FR'), color: BRAND.blurple },
    { label: 'Vocal (min)', value: stats.totalVoice.toLocaleString('fr-FR'), color: BRAND.green },
    { label: 'Nouveaux membres', value: `+${stats.newMembers}`, color: BRAND.yellow },
    { label: 'Total membres', value: stats.totalMembers.toLocaleString('fr-FR'), color: BRAND.pink },
  ];

  const kpiW = 340, kpiH = 100, kpiGap = 20;
  for (let i = 0; i < kpis.length; i++) {
    const k = kpis[i];
    const row = Math.floor(i / 2), col = i % 2;
    const x = 40 + col * (kpiW + kpiGap);
    const y = 110 + row * (kpiH + kpiGap);
    drawKPI(ctx, x, y, kpiW, kpiH, k.value, k.label, k.color);
  }

  // Active members status
  const statusY = H - 70;
  roundRect(ctx, 40, statusY, W - 80, 42, 10, BRAND.card, BRAND.border);

  ctx.fillStyle = BRAND.green;
  ctx.beginPath();
  ctx.arc(60, statusY + 21, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = BRAND.textSecondary;
  ctx.font = canvasFont(15, 'bold');
  ctx.fillText(`${stats.activeMembers} membres actifs sur cette période`, 76, statusY + 26);

  drawBottomBar(ctx, W, H);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────
// generateProfileCard — NEW: Rich Profile Card Image
// ─────────────────────────────────────────────────────────────
export async function generateProfileCard(options: {
  displayName: string;
  username: string;
  avatarUrl: string;
  bannerColor?: string;
  bio?: string;
  messageCount: number;
  voiceTime: string;
  level?: number;
  xp?: number;
  rank?: number;
  joinedAt?: string;
  roles: string[];
  streak?: number;
  tier?: string;
  isPrivate?: boolean;
}): Promise<Buffer> {
  ensureCanvasFonts();
  const W = 934, H = 520;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);

  // Banner area
  const bannerH = 140;
  const bannerGrad = ctx.createLinearGradient(0, 0, W, bannerH);
  bannerGrad.addColorStop(0, options.bannerColor || BRAND.blurple);
  bannerGrad.addColorStop(0.5, '#7b68ee');
  bannerGrad.addColorStop(1, BRAND.green);
  ctx.fillStyle = bannerGrad;
  ctx.fillRect(0, 0, W, bannerH);

  // Banner overlay fade
  const bannerFade = ctx.createLinearGradient(0, bannerH - 50, 0, bannerH);
  bannerFade.addColorStop(0, 'rgba(7, 9, 14, 0)');
  bannerFade.addColorStop(1, BRAND.bg1);
  ctx.fillStyle = bannerFade;
  ctx.fillRect(0, bannerH - 50, W, 50);

  // Glows
  const glow = ctx.createRadialGradient(W * 0.8, 100, 0, W * 0.8, 100, 300);
  glow.addColorStop(0, 'rgba(87, 242, 135, 0.12)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Avatar (large, with border)
  const avatarCX = 100, avatarCY = bannerH - 10, avatarR = 56;
  ctx.beginPath();
  ctx.arc(avatarCX, avatarCY, avatarR + 5, 0, Math.PI * 2);
  ctx.fillStyle = BRAND.bg1;
  ctx.fill();
  
  // Custom glowing avatar border ring
  ctx.beginPath();
  ctx.arc(avatarCX, avatarCY, avatarR + 2, 0, Math.PI * 2);
  ctx.strokeStyle = options.bannerColor || BRAND.blurple;
  ctx.lineWidth = 3;
  ctx.stroke();

  await drawCircularAvatar(ctx, options.avatarUrl, avatarCX, avatarCY, avatarR, options.displayName);

  // Name & username
  const nameX = avatarCX + avatarR + 24;
  ctx.fillStyle = BRAND.textPrimary;
  ctx.font = canvasFont(28, 'bold');
  ctx.fillText(truncate(options.displayName, 28), nameX, bannerH + 18);

  ctx.fillStyle = BRAND.textMuted;
  ctx.font = canvasFont(16, 'normal');
  ctx.fillText(`@${options.username}`, nameX, bannerH + 42);

  // Tier badge
  if (options.tier) {
    const tierX = nameX + ctx.measureText(`@${options.username}`).width + 16;
    roundRect(ctx, tierX, bannerH + 28, ctx.measureText(options.tier).width + 16, 20, 10, 'rgba(88, 101, 242, 0.2)');
    ctx.fillStyle = BRAND.blurple;
    ctx.font = canvasFont(11, 'bold');
    ctx.fillText(options.tier, tierX + 8, bannerH + 42);
  }

  // Rank badge (top right)
  if (options.rank) {
    const rankLabel = `#${options.rank}`;
    ctx.font = canvasFont(36, 'bold');
    const rankW = ctx.measureText(rankLabel).width;
    const rankX = W - 50 - rankW;

    ctx.fillStyle = BRAND.blurple;
    ctx.font = canvasFont(13, 'bold');
    ctx.textAlign = 'right';
    ctx.fillText('RANG', W - 50, bannerH + 8);
    ctx.fillStyle = BRAND.textPrimary;
    ctx.font = canvasFont(36, 'bold');
    ctx.fillText(rankLabel, W - 50, bannerH + 44);
    ctx.textAlign = 'left';
  }

  // Bio
  const contentY = bannerH + 60;
  if (options.bio) {
    ctx.fillStyle = BRAND.textSecondary;
    ctx.font = canvasFont(14, 'normal');
    ctx.fillText(truncate(options.bio, 90), 40, contentY + 12);
  }

  drawSeparatorLine(ctx, 40, contentY + 30, W - 80);

  // Stats Grid (4 cards)
  const statsY = contentY + 48;
  const statCards = [
    { label: 'Messages', value: options.messageCount.toLocaleString('fr-FR'), color: BRAND.blurple },
    { label: 'Vocal', value: options.voiceTime, color: BRAND.green },
    { label: 'Niveau', value: options.level !== undefined ? String(options.level) : '—', color: BRAND.pink },
    { label: 'Streak', value: options.streak !== undefined ? `${options.streak}j` : '—', color: BRAND.yellow },
  ];

  const statW = 195, statH = 72, statGap = 16;
  const totalStatsW = statCards.length * statW + (statCards.length - 1) * statGap;
  const statStartX = Math.floor((W - totalStatsW) / 2);

  for (let i = 0; i < statCards.length; i++) {
    const s = statCards[i];
    const x = statStartX + i * (statW + statGap);
    drawKPI(ctx, x, statsY, statW, statH, s.value, s.label, s.color);
  }

  // XP Progress (if available)
  if (options.xp !== undefined && options.level !== undefined) {
    const xpBarY = statsY + statH + 20;
    const xpBarX = 40, xpBarW = W - 80, xpBarH = 14;

    const getXpForLevel = (l: number) => l < 0 ? 0 : 100 * l * l + 200 * l;
    const prevXp = getXpForLevel(options.level - 1);
    const nextXp = getXpForLevel(options.level);
    const progress = Math.min(1, Math.max(0, (options.xp - prevXp) / (nextXp - prevXp || 1)));

    roundRect(ctx, xpBarX, xpBarY, xpBarW, xpBarH, 7, 'rgba(255,255,255,0.06)');
    if (progress > 0) {
      const filledW = Math.max(xpBarH, xpBarW * progress);
      const grad = ctx.createLinearGradient(xpBarX, 0, xpBarX + filledW, 0);
      grad.addColorStop(0, BRAND.blurple);
      grad.addColorStop(1, BRAND.green);
      roundRect(ctx, xpBarX, xpBarY, filledW, xpBarH, 7, grad);
    }

    ctx.fillStyle = BRAND.textMuted;
    ctx.font = canvasFont(12, 'bold');
    ctx.fillText(`Niv. ${options.level}`, xpBarX, xpBarY + xpBarH + 16);
    ctx.textAlign = 'right';
    const xpInLevel = Math.max(0, options.xp - prevXp);
    const xpNeeded = nextXp - prevXp || 1;
    ctx.fillText(`${xpInLevel.toLocaleString('fr-FR')} / ${xpNeeded.toLocaleString('fr-FR')} XP`, xpBarX + xpBarW, xpBarY + xpBarH + 16);
    ctx.textAlign = 'left';
  }

  // Roles (bottom section)
  if (options.roles.length > 0) {
    const rolesY = H - 70;
    ctx.fillStyle = BRAND.textMuted;
    ctx.font = canvasFont(12, 'bold');
    ctx.fillText('Rôles', 40, rolesY);

    let roleX = 40;
    const maxRoles = 8;
    for (let i = 0; i < Math.min(options.roles.length, maxRoles); i++) {
      const role = options.roles[i];
      const rw = ctx.measureText(truncate(role, 16)).width + 16;
      roundRect(ctx, roleX, rolesY + 8, rw, 22, 11, 'rgba(88, 101, 242, 0.12)', 'rgba(88, 101, 242, 0.25)');
      ctx.fillStyle = BRAND.textSecondary;
      ctx.font = canvasFont(11, 'normal');
      ctx.fillText(truncate(role, 16), roleX + 8, rolesY + 23);
      roleX += rw + 6;
      if (roleX > W - 100) break;
    }
    if (options.roles.length > maxRoles) {
      ctx.fillStyle = BRAND.textMuted;
      ctx.font = canvasFont(11, 'bold');
      ctx.fillText(`+${options.roles.length - maxRoles}`, roleX + 4, rolesY + 23);
    }
  }

  // Joined at
  if (options.joinedAt) {
    ctx.fillStyle = BRAND.textDark;
    ctx.font = canvasFont(11, 'normal');
    ctx.textAlign = 'right';
    ctx.fillText(`Membre depuis ${options.joinedAt}`, W - 40, H - 16);
    ctx.textAlign = 'left';
  }

  // Branding
  ctx.fillStyle = BRAND.textDark;
  ctx.font = canvasFont(11, 'normal');
  ctx.fillText('Kotbo · Profil communautaire', 40, H - 16);

  drawBottomBar(ctx, W, H);
  return canvas.toBuffer('image/png');
}
