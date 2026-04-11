export interface StaffMember {
  id: string;
  guildId: string;
  userId: string;
  grade: string;
  joinedStaffAt: Date | string;
  currentRoleStartedAt: Date | string;
  userTag?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface APIKey {
  id: string;
  guildId: string;
  createdByUserId: string;
  keyHash: string;
  displayKey: string;
  name: string;
  permissions: string[];
  isActive: boolean;
  lastUsedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface StaffRole {
  id: string;
  guildId: string;
  name: string;
  level: number;
  discordRoleId?: string | null;
  color?: string | null;
  sortOrder: number;
  enabled: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface TestingPeriod {
  id: string;
  guildId: string;
  staffUserId: string;
  mentorId?: string | null;
  startDate: Date | string;
  endDate?: Date | string | null;
  status: 'ONGOING' | 'PASSED' | 'FAILED';
  plannedDurationDays: number;
  targetGrade?: string | null;
  notes?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface StaffManagerNote {
  id: string;
  guildId: string;
  targetUserId: string;
  authorId: string;
  content: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  author?: StaffMember;
}
