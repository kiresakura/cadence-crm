import type {
  ActivityType,
  CompanySize,
  LifecycleStage,
  Role,
  StageType,
  TaskPriority,
} from "@/generated/prisma/enums";

export const LIFECYCLE_LABELS: Record<LifecycleStage, string> = {
  LEAD: "Lead",
  PROSPECT: "Prospect",
  CUSTOMER: "Customer",
  CHURNED: "Churned",
};

export const COMPANY_SIZE_LABELS: Record<CompanySize, string> = {
  SIZE_1_10: "1–10",
  SIZE_11_50: "11–50",
  SIZE_51_200: "51–200",
  SIZE_201_1000: "201–1,000",
  SIZE_1001_PLUS: "1,000+",
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  NOTE: "Note",
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Full access, including ownership and workspace settings.",
  ADMIN: "Manage pipelines, tags, custom fields and members.",
  MEMBER: "Create, edit and delete contacts, companies, deals and tasks.",
  VIEWER: "Read-only access.",
};

export const STAGE_TYPE_LABELS: Record<StageType, string> = {
  OPEN: "Open",
  WON: "Won",
  LOST: "Lost",
};

export function formatMoney(
  amount: number | string,
  currency = "USD",
  options: { compact?: boolean } = {},
): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      notation: options.compact ? "compact" : "standard",
      maximumFractionDigits: options.compact ? 1 : Number.isInteger(value) ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function formatDate(value: Date | string | null | undefined, timeZone = "UTC"): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

/** Calendar dates (`@db.Date`) are stored at UTC midnight and must be shown in UTC. */
export function formatCalendarDate(value: Date | string | null | undefined): string {
  return formatDate(value, "UTC");
}

export function formatDateTime(value: Date | string | null | undefined, timeZone = "UTC"): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

/** "YYYY-MM-DDTHH:mm" in a time zone, for `datetime-local` inputs. */
export function toDateTimeLocal(value: Date | string | null | undefined, timeZone = "UTC"): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const CJK_NAME = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

/** "Ada Lovelace", but "王小明" for Chinese, Japanese and Korean names (family name first). */
export function fullName(person: { firstName: string; lastName: string }): string {
  return CJK_NAME.test(person.firstName) || CJK_NAME.test(person.lastName)
    ? `${person.lastName}${person.firstName}`
    : `${person.firstName} ${person.lastName}`;
}

export const TAG_COLOR_CLASSES: Record<string, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-200",
  blue: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200",
  pink: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-200",
};
