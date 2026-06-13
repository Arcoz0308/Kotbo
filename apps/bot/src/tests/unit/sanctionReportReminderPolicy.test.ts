import { describe, expect, test } from 'bun:test';
import { getMissingReportReminderActions } from '../../services/moderation/sanctionReportReminderPolicy';

const now = new Date('2026-06-13T12:00:00.000Z');
const day = 24 * 60 * 60 * 1000;

function state(ageDays: number, overrides: Record<string, unknown> = {}) {
  return {
    createdAt: new Date(now.getTime() - ageDays * day),
    lastReportReminderAt: null,
    managerReportEscalatedAt: null,
    ...overrides,
  };
}

describe('sanction report reminder policy', () => {
  test('does nothing before J+3', () => {
    expect(getMissingReportReminderActions(state(2), now)).toEqual({
      remindModerator: false,
      escalateManagers: false,
    });
  });

  test('reminds the moderator at J+3', () => {
    expect(getMissingReportReminderActions(state(3), now).remindModerator).toBe(true);
  });

  test('does not remind again during the next 24 hours', () => {
    const result = getMissingReportReminderActions(state(4, {
      lastReportReminderAt: new Date(now.getTime() - 23 * 60 * 60 * 1000),
    }), now);
    expect(result.remindModerator).toBe(false);
  });

  test('reminds again after 24 hours', () => {
    const result = getMissingReportReminderActions(state(4, {
      lastReportReminderAt: new Date(now.getTime() - day),
    }), now);
    expect(result.remindModerator).toBe(true);
  });

  test('escalates once to managers at J+7', () => {
    expect(getMissingReportReminderActions(state(7), now).escalateManagers).toBe(true);
    expect(getMissingReportReminderActions(state(8, {
      managerReportEscalatedAt: new Date(now.getTime() - day),
    }), now).escalateManagers).toBe(false);
  });

  test('does nothing when a report exists', () => {
    expect(getMissingReportReminderActions(state(10, { hasReport: true }), now)).toEqual({
      remindModerator: false,
      escalateManagers: false,
    });
  });
});
