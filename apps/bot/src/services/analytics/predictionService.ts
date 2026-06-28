import { prismaRead } from '../../utils/db.js';

export interface TrendPoint {
  dateKey: string;
  value: number;
  predicted?: boolean;
}

export interface AnomalyAlert {
  type: string;
  metric: string;
  message: string;
  severity: 'info' | 'warning' | 'danger';
  dateKey: string;
  value: number;
  expectedRange: { min: number; max: number };
}

export interface PredictionData {
  membersTrend: TrendPoint[];
  messagesTrend: TrendPoint[];
  voiceTrend: TrendPoint[];
  growthForecast: { predicted7d: number; predicted30d: number; confidence: number };
  anomalies: AnomalyAlert[];
  seasonality: { busiestDay: string; quietestDay: string; busiestHour: number; quietestHour: number };
}

function weightedLinearRegression(data: number[]): { slope: number; intercept: number } {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: data[0] ?? 0 };

  let sumW = 0, sumWX = 0, sumWY = 0, sumWXY = 0, sumWX2 = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.2 + 0.8 * (i / (n - 1)); // Les points récents ont plus de poids (entre 0.2 et 1.0)
    sumW += w;
    sumWX += w * i;
    sumWY += w * data[i];
    sumWXY += w * i * data[i];
    sumWX2 += w * i * i;
  }

  const slope = (sumW * sumWXY - sumWX * sumWY) / (sumW * sumWX2 - sumWX * sumWX);
  const intercept = (sumWY - slope * sumWX) / sumW;
  return { slope: isNaN(slope) ? 0 : slope, intercept: isNaN(intercept) ? 0 : intercept };
}

function projectTrendWithSeasonality(data: number[], dates: string[], daysAhead: number): number[] {
  const n = data.length;
  if (n === 0) return Array(daysAhead).fill(0);
  const { slope, intercept } = weightedLinearRegression(data);

  // Calcul du coefficient saisonnier hebdomadaire (réel / tendance)
  const deviations = Array.from({ length: 7 }, () => [] as number[]);
  for (let i = 0; i < n; i++) {
    const trendVal = intercept + slope * i;
    if (trendVal <= 0) continue;
    const actualVal = data[i];
    const ratio = actualVal / trendVal;
    
    const date = new Date(dates[i]);
    if (!isNaN(date.getTime())) {
      const dayOfWeek = date.getDay();
      deviations[dayOfWeek].push(ratio);
    }
  }

  const seasonalIndices = deviations.map((ratios) => {
    if (ratios.length === 0) return 1.0;
    return ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
  });

  const predictions: number[] = [];
  const lastDate = n > 0 && dates[n - 1] ? new Date(dates[n - 1]) : new Date();

  for (let i = 1; i <= daysAhead; i++) {
    const projectedIndex = n + i - 1;
    const trendVal = intercept + slope * projectedIndex;

    const futureDate = new Date(lastDate);
    futureDate.setDate(lastDate.getDate() + i);
    const dayOfWeek = futureDate.getDay();
    const seasonalRatio = seasonalIndices[dayOfWeek];

    predictions.push(Math.max(0, Math.round(trendVal * seasonalRatio)));
  }

  return predictions;
}

function detectAnomalies(data: Array<{ dateKey: string; value: number }>, metric: string): AnomalyAlert[] {
  if (data.length < 7) return [];

  const values = data.map((d) => d.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);

  if (stdDev === 0) return [];

  const alerts: AnomalyAlert[] = [];
  const threshold = 2;

  for (const point of data.slice(-7)) {
    const zScore = (point.value - mean) / stdDev;
    if (Math.abs(zScore) > threshold) {
      alerts.push({
        type: zScore > 0 ? 'spike' : 'drop',
        metric,
        message: zScore > 0
          ? `Pic anormal de ${metric} le ${point.dateKey} (${point.value} vs moyenne ${Math.round(mean)})`
          : `Chute anormale de ${metric} le ${point.dateKey} (${point.value} vs moyenne ${Math.round(mean)})`,
        severity: Math.abs(zScore) > 3 ? 'danger' : 'warning',
        dateKey: point.dateKey,
        value: point.value,
        expectedRange: { min: Math.round(mean - stdDev * threshold), max: Math.round(mean + stdDev * threshold) },
      });
    }
  }

  return alerts;
}

const DAY_NAMES = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export async function getPredictionData(guildId: string, days = 30): Promise<PredictionData> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startKey = startDate.toISOString().slice(0, 10);

  const [dailyStats, hourlyStats] = await Promise.all([
    prismaRead.guildDailyStat.findMany({
      where: { guildId, dateKey: { gte: startKey } },
      orderBy: { dateKey: 'asc' },
    }),
    prismaRead.guildHourlyStat.findMany({
      where: { guildId, dateKey: { gte: startKey } },
      orderBy: [{ dateKey: 'asc' }, { hour: 'asc' }],
    }),
  ]);

  // Build trend data
  const membersData = dailyStats.map((s) => ({ dateKey: s.dateKey, value: s.totalMembers }));
  const messagesData = dailyStats.map((s) => ({ dateKey: s.dateKey, value: s.messagesCount }));
  const voiceData = dailyStats.map((s) => ({ dateKey: s.dateKey, value: s.voiceMinutes }));

  // Predictions (7 days ahead)
  const membersValues = membersData.map((d) => d.value);
  const messagesValues = messagesData.map((d) => d.value);
  const voiceValues = voiceData.map((d) => d.value);

  const dates = dailyStats.map((s) => s.dateKey);
  const membersPredicted = projectTrendWithSeasonality(membersValues, dates, 7);
  const messagesPredicted = projectTrendWithSeasonality(messagesValues, dates, 7);
  const voicePredicted = projectTrendWithSeasonality(voiceValues, dates, 7);

  const today = new Date();
  const futureDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i + 1);
    return d.toISOString().slice(0, 10);
  });

  const membersTrend: TrendPoint[] = [
    ...membersData,
    ...futureDates.map((dk, i) => ({ dateKey: dk, value: membersPredicted[i], predicted: true })),
  ];
  const messagesTrend: TrendPoint[] = [
    ...messagesData,
    ...futureDates.map((dk, i) => ({ dateKey: dk, value: messagesPredicted[i], predicted: true })),
  ];
  const voiceTrend: TrendPoint[] = [
    ...voiceData,
    ...futureDates.map((dk, i) => ({ dateKey: dk, value: voicePredicted[i], predicted: true })),
  ];

  // Growth forecast
  const { slope: growthSlope } = weightedLinearRegression(membersValues);
  const lastMembers = membersValues[membersValues.length - 1] ?? 0;
  
  let confidence = 85;
  if (membersValues.length >= 5) {
    let sumSquaredResiduals = 0;
    let sumSquaredTotal = 0;
    const mean = membersValues.reduce((sum, v) => sum + v, 0) / membersValues.length;
    for (let i = 0; i < membersValues.length; i++) {
      const fitted = growthSlope * i + (lastMembers - growthSlope * (membersValues.length - 1));
      sumSquaredResiduals += (membersValues[i] - fitted) ** 2;
      sumSquaredTotal += (membersValues[i] - mean) ** 2;
    }
    const rSquared = sumSquaredTotal > 0 ? 1 - (sumSquaredResiduals / sumSquaredTotal) : 1;
    confidence = Math.round(Math.max(50, Math.min(98, (rSquared * 30) + 68)));
  }

  const growthForecast = {
    predicted7d: Math.round(lastMembers + growthSlope * 7),
    predicted30d: Math.round(lastMembers + growthSlope * 30),
    confidence,
  };

  // Anomalies
  const anomalies = [
    ...detectAnomalies(messagesData, 'messages'),
    ...detectAnomalies(voiceData, 'vocal'),
    ...detectAnomalies(membersData.map((d) => ({ dateKey: d.dateKey, value: dailyStats.find((s) => s.dateKey === d.dateKey)?.membersLeft ?? 0 })), 'départs'),
  ];

  // Seasonality
  const dayTotals = new Map<number, number>();
  for (const stat of dailyStats) {
    const day = new Date(stat.dateKey).getDay();
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + stat.messagesCount);
  }

  let busiestDay = 0, quietestDay = 0, busiestDayVal = 0, quietestDayVal = Infinity;
  for (const [day, total] of dayTotals) {
    if (total > busiestDayVal) { busiestDay = day; busiestDayVal = total; }
    if (total < quietestDayVal) { quietestDay = day; quietestDayVal = total; }
  }

  const hourTotals = new Map<number, number>();
  for (const stat of hourlyStats) {
    hourTotals.set(stat.hour, (hourTotals.get(stat.hour) ?? 0) + stat.messagesCount);
  }

  let busiestHour = 0, quietestHour = 0, busiestHourVal = 0, quietestHourVal = Infinity;
  for (const [hour, total] of hourTotals) {
    if (total > busiestHourVal) { busiestHour = hour; busiestHourVal = total; }
    if (total < quietestHourVal) { quietestHour = hour; quietestHourVal = total; }
  }

  return {
    membersTrend,
    messagesTrend,
    voiceTrend,
    growthForecast,
    anomalies,
    seasonality: {
      busiestDay: DAY_NAMES[busiestDay],
      quietestDay: DAY_NAMES[quietestDay],
      busiestHour,
      quietestHour,
    },
  };
}
