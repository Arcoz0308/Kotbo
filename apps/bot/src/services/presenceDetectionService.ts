export type OnlineMemberCountSource = {
  totalMembers: number;
  onlineMembersFromCache: number;
  fetchApproximatePresenceCount?: () => Promise<number | null | undefined>;
};

export async function resolveOnlineMembersCount(source: OnlineMemberCountSource): Promise<number> {
  const { totalMembers, onlineMembersFromCache, fetchApproximatePresenceCount } = source;

  if (onlineMembersFromCache !== 0 || totalMembers <= 1 || !fetchApproximatePresenceCount) {
    return onlineMembersFromCache;
  }

  try {
    const approximatePresenceCount = await fetchApproximatePresenceCount();
    if (approximatePresenceCount !== null && approximatePresenceCount !== undefined) {
      return approximatePresenceCount;
    }
  } catch {
    // Fallback silencieux: on conserve le compte issu du cache si le fetch échoue.
  }

  return onlineMembersFromCache;
}