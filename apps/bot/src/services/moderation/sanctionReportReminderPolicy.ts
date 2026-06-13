const DAY_MS = 24 * 60 * 60 * 1000;

export type MissingReportReminderState = {
  createdAt: Date;
  lastReportReminderAt: Date | null;
  managerReportEscalatedAt: Date | null;
  hasReport?: boolean;
};

export function getMissingReportReminderActions(
  state: MissingReportReminderState,
  now = new Date(),
): { remindModerator: boolean; escalateManagers: boolean } {
  if (state.hasReport) {
    return { remindModerator: false, escalateManagers: false };
  }

  const ageMs = now.getTime() - state.createdAt.getTime();
  const reminderAgeMs = state.lastReportReminderAt
    ? now.getTime() - state.lastReportReminderAt.getTime()
    : Number.POSITIVE_INFINITY;

  return {
    remindModerator: ageMs >= 3 * DAY_MS && reminderAgeMs >= DAY_MS,
    escalateManagers: ageMs >= 7 * DAY_MS && !state.managerReportEscalatedAt,
  };
}
