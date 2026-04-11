import { createCanvas } from '@napi-rs/canvas';
import prisma from '../utils/db.js';

export async function generateStatsImage(guildId: string): Promise<Buffer> {
  const W = 1000, H = 650;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b0e14');
  bg.addColorStop(0.5, '#111621');
  bg.addColorStop(1, '#0b0e14');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 0, bg);

  const glow1 = ctx.createRadialGradient(150, 80, 0, 150, 80, 400);
  glow1.addColorStop(0, 'rgba(88, 101, 242, 0.12)');
  glow1.addColorStop(1, 'rgba(88, 101, 242, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W - 200, H - 100, 0, W - 200, H - 100, 350);
  glow2.addColorStop(0, 'rgba(87, 242, 135, 0.08)');
  glow2.addColorStop(1, 'rgba(87, 242, 135, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, '#5865f2');
  topBar.addColorStop(0.35, '#7b68ee');
  topBar.addColorStop(0.65, '#57f287');
  topBar.addColorStop(1, '#5865f2');
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 4);

  const barGlow = ctx.createLinearGradient(0, 4, 0, 20);
  barGlow.addColorStop(0, 'rgba(88, 101, 242, 0.3)');
  barGlow.addColorStop(1, 'rgba(88, 101, 242, 0)');
  ctx.fillStyle = barGlow;
  ctx.fillRect(0, 4, W, 16);

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const feeds = await prisma.feed.findMany({
    where: { guildId },
    include: {
      items: { where: { status: 'APPROVED' } },
      subscribers: true,
    },
    orderBy: { name: 'asc' },
  });

  const totalApproved = feeds.reduce((s, f) => s + f.items.length, 0);
  const todayApproved = feeds.reduce(
    (s, f) => s + f.items.filter((i) => i.createdAt >= today).length,
    0,
  );
  const weekApproved = feeds.reduce(
    (s, f) => s + f.items.filter((i) => i.createdAt >= weekAgo).length,
    0,
  );
  const totalSubs = feeds.reduce((s, f) => s + f.subscribers.length, 0);
  const activeFeeds = feeds.filter((f) => f.enabled).length;

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('📊  Kotbo News — Statistiques', 40, 52);

  ctx.fillStyle = '#4e5563';
  ctx.font = '14px sans-serif';
  ctx.fillText(
    now.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    40,
    78,
  );

  const sep1 = ctx.createLinearGradient(40, 0, W - 40, 0);
  sep1.addColorStop(0, 'rgba(88, 101, 242, 0.4)');
  sep1.addColorStop(0.5, 'rgba(87, 242, 135, 0.2)');
  sep1.addColorStop(1, 'rgba(88, 101, 242, 0)');
  ctx.fillStyle = sep1;
  ctx.fillRect(40, 92, W - 80, 1);

  const cards = [
    { label: "Aujourd'hui", value: String(todayApproved), color: '#57f287', icon: '📰' },
    { label: 'Cette semaine', value: String(weekApproved), color: '#5865f2', icon: '📅' },
    { label: 'Total validées', value: String(totalApproved), color: '#fee75c', icon: '✅' },
    { label: 'Abonnés DM', value: String(totalSubs), color: '#eb459e', icon: '📬' },
    { label: 'Flux actifs', value: `${activeFeeds}/${feeds.length}`, color: '#5bc0eb', icon: '📡' },
  ];

  const cardW = 168, cardH = 100, cardY = 112, cardGap = 16;
  const totalCardsW = cards.length * cardW + (cards.length - 1) * cardGap;
  const cardStartX = Math.floor((W - totalCardsW) / 2);

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const x = cardStartX + i * (cardW + cardGap);

    roundRect(ctx, x + 2, cardY + 3, cardW, cardH, 14, 'rgba(0,0,0,0.35)');

    roundRect(ctx, x, cardY, cardW, cardH, 14, '#161b25');

    roundRect(ctx, x, cardY, 4, cardH, 2, c.color);

    ctx.font = '22px sans-serif';
    ctx.fillText(c.icon, x + 16, cardY + 34);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(c.value, x + 16, cardY + 72);

    ctx.fillStyle = '#6e7681';
    ctx.font = '12px sans-serif';
    ctx.fillText(c.label, x + 16, cardY + 90);
  }

  const sectionY = cardY + cardH + 24;
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(40, sectionY, W - 80, 1);
  const chartX = 40, chartY = sectionY + 28, chartW = 560;
  const barH = 26, barGap = 10;

  ctx.fillStyle = '#c9d1d9';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('⚡  Top Flux RSS', chartX, chartY);

  const topFeeds = [...feeds]
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 7);

  const maxVal = Math.max(...topFeeds.map((f) => f.items.length), 1);

  for (let i = 0; i < topFeeds.length; i++) {
    const feed = topFeeds[i];
    const y = chartY + 20 + i * (barH + barGap);
    const barMaxW = chartW - 200;
    const barW = Math.max(6, (feed.items.length / maxVal) * barMaxW);

    ctx.fillStyle = '#8b949e';
    ctx.font = '13px sans-serif';
    ctx.fillText(truncate(feed.name, 22), chartX, y + barH - 8);
    roundRect(ctx, chartX + 180, y, barMaxW, barH, 8, '#1c2130');

    const grad = ctx.createLinearGradient(chartX + 180, 0, chartX + 180 + barW, 0);
    grad.addColorStop(0, '#5865f2');
    grad.addColorStop(1, '#57f287');
    roundRect(ctx, chartX + 180, y, barW, barH, 8, grad);

    const barGlow2 = ctx.createLinearGradient(chartX + 180, y, chartX + 180 + barW, y);
    barGlow2.addColorStop(0, 'rgba(88, 101, 242, 0.15)');
    barGlow2.addColorStop(1, 'rgba(87, 242, 135, 0.08)');
    roundRect(ctx, chartX + 180, y + barH, barW, 4, 2, barGlow2);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(String(feed.items.length), chartX + 180 + barW + 10, y + barH - 8);
  }

  const rightX = 640, rightY = sectionY + 28;

  roundRect(ctx, rightX - 16, rightY - 16, W - rightX + 16 - 24, 310, 16, '#141820');

  ctx.fillStyle = '#c9d1d9';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('👥  Abonnés par flux', rightX, rightY);

  const topBySubs = [...feeds]
    .sort((a, b) => b.subscribers.length - a.subscribers.length)
    .slice(0, 8);

  for (let i = 0; i < topBySubs.length; i++) {
    const feed = topBySubs[i];
    const y = rightY + 24 + i * (barH + barGap + 2);

    ctx.fillStyle = '#8b949e';
    ctx.font = '13px sans-serif';
    ctx.fillText(truncate(feed.name, 20), rightX, y + 16);
    const subCount = feed.subscribers.length;
    const dotColor = subCount > 5 ? '#57f287' : subCount > 0 ? '#fee75c' : '#4e5563';

    ctx.beginPath();
    ctx.arc(rightX + 210, y + 12, 4, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    ctx.fillStyle = '#c9d1d9';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(String(subCount), rightX + 222, y + 17);
  }

  const footerY = H - 36;

  const footerBg = ctx.createLinearGradient(0, footerY - 8, 0, H);
  footerBg.addColorStop(0, 'rgba(11, 14, 20, 0)');
  footerBg.addColorStop(1, 'rgba(11, 14, 20, 0.9)');
  ctx.fillStyle = footerBg;
  ctx.fillRect(0, footerY - 8, W, H - footerY + 8);

  const bottomBar = ctx.createLinearGradient(0, 0, W, 0);
  bottomBar.addColorStop(0, 'rgba(88, 101, 242, 0)');
  bottomBar.addColorStop(0.3, 'rgba(88, 101, 242, 0.5)');
  bottomBar.addColorStop(0.7, 'rgba(87, 242, 135, 0.5)');
  bottomBar.addColorStop(1, 'rgba(87, 242, 135, 0)');
  ctx.fillStyle = bottomBar;
  ctx.fillRect(0, H - 2, W, 2);

  ctx.fillStyle = '#3b4048';
  ctx.font = '12px sans-serif';
  ctx.fillText('Kotbo • RSS et YouTube', 40, H - 12);

  ctx.fillStyle = '#3b4048';
  ctx.font = '12px sans-serif';
  const footerRight = `${activeFeeds} flux actifs  •  ${totalApproved} articles`;
  const footerRightW = ctx.measureText(footerRight).width;
  ctx.fillText(footerRight, W - 40 - footerRightW, H - 12);

  return canvas.toBuffer('image/png');
}

export async function generateWeeklyRecapImage(guildId: string, items: any[]): Promise<Buffer> {
  const W = 1000, H = 700;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // 1. Background (Premium Dark Gradient)
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f1219');
  bg.addColorStop(0.5, '#161b25');
  bg.addColorStop(1, '#0f1219');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 2. Decorative Glows
  const glow1 = ctx.createRadialGradient(200, 100, 0, 200, 100, 500);
  glow1.addColorStop(0, 'rgba(88, 101, 242, 0.15)');
  glow1.addColorStop(1, 'rgba(88, 101, 242, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W - 200, H - 100, 0, W - 200, H - 100, 450);
  glow2.addColorStop(0, 'rgba(87, 242, 135, 0.1)');
  glow2.addColorStop(1, 'rgba(87, 242, 135, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // 3. Header
  const topBar = ctx.createLinearGradient(0, 0, W, 0);
  topBar.addColorStop(0, '#5865f2');
  topBar.addColorStop(0.5, '#57f287');
  topBar.addColorStop(1, '#5865f2');
  ctx.fillStyle = topBar;
  ctx.fillRect(0, 0, W, 6);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('🌟  LE RECAP HEBDO KOTBO', 50, 70);

  ctx.fillStyle = '#8b949e';
  ctx.font = '18px sans-serif';
  ctx.fillText('Les actualités tech qui ont marqué la communauté cette semaine', 50, 105);

  const divider = ctx.createLinearGradient(50, 0, W - 50, 0);
  divider.addColorStop(0, 'rgba(255,255,255,0.1)');
  divider.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  divider.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = divider;
  ctx.fillRect(50, 125, W - 100, 1);

  // 4. Render News Items (Top 5)
  const itemX = 50;
  let itemY = 160;
  const itemW = W - 100;
  const itemH = 95;
  const itemGap = 15;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const y = itemY + i * (itemH + itemGap);

    // Card Background (Glassmorphism effect)
    roundRect(ctx, itemX, y, itemW, itemH, 12, 'rgba(255, 255, 255, 0.03)');
    
    // Left accent bar
    const accentColor = i === 0 ? '#fee75c' : i === 1 ? '#c9d1d9' : i === 2 ? '#cd7f32' : '#5865f2';
    roundRect(ctx, itemX, y, 6, itemH, 3, accentColor);

    // Rank Circle
    ctx.beginPath();
    ctx.arc(itemX + 40, y + itemH / 2, 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), itemX + 40, y + itemH / 2 + 7);
    ctx.textAlign = 'left';

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    const title = item.titleTranslated ?? item.title;
    ctx.fillText(truncate(title, 75), itemX + 90, y + 42);

    // Metadata (Source & Category)
    ctx.fillStyle = '#8b949e';
    ctx.font = '14px sans-serif';
    const sourceLabel = `📡 ${item.feed?.name ?? 'Inconnue'}  •  📁 ${item.feed?.category ?? 'Général'}`;
    ctx.fillText(sourceLabel, itemX + 90, y + 70);

    // Interest Score Badge
    if (item.interestScore) {
        const scoreW = 80;
        const scoreX = itemX + itemW - scoreW - 20;
        roundRect(ctx, scoreX, y + 35, scoreW, 30, 15, 'rgba(87, 242, 135, 0.1)');
        ctx.fillStyle = '#57f287';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(item.interestScore * 100)}%`, scoreX + scoreW / 2, y + 54);
        ctx.textAlign = 'left';
    }
  }

  // 5. Footer
  const footerY = H - 30;
  ctx.fillStyle = '#4e5563';
  ctx.font = '12px sans-serif';
  ctx.fillText('Kotbo News Generator • Intelligence Artificielle & Veille Tech • ' + new Date().toLocaleDateString('fr'), 50, footerY);

  return canvas.toBuffer('image/png');
}

function roundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
) {
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
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
