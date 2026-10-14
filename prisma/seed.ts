/**
 * Demo data: one workspace with fictional companies, contacts, deals, activities and tasks,
 * plus owner / member / viewer accounts. Uses a fixed random seed, so every run produces the
 * same records (dates are relative to today so the dashboard always looks current).
 *
 *   npm run db:seed
 *
 * Re-running replaces the previous demo workspace. Refuses to run when APP_ENV=production.
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, type Contact, type Deal, type Prisma } from "../src/generated/prisma/client";
import type {
  ActivityType,
  CompanySize,
  LifecycleStage,
  TaskPriority,
} from "../src/generated/prisma/enums";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/lib/demo";
import { hashPassword } from "../src/server/auth/password";
import { DEFAULT_STAGES } from "../src/server/domain/deal-stage";
import { normalizePhone } from "../src/server/domain/phone";
import { getAppEnv } from "../src/server/env";

config({ quiet: true });

const DEMO_SLUG = "cadence-demo";
const DAY = 24 * 60 * 60 * 1000;

/** Small deterministic PRNG (mulberry32) so the demo data is identical on every run. */
function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
    chance: (probability: number) => next() < probability,
  };
}

const COMPANIES: Array<{ name: string; industry: string }> = [
  { name: "Amberleaf Analytics", industry: "Software" },
  { name: "Birchwick Logistics", industry: "Logistics" },
  { name: "Cobaltine Robotics", industry: "Manufacturing" },
  { name: "Driftmoor Foods", industry: "Food & beverage" },
  { name: "Emberfield Energy", industry: "Energy" },
  { name: "Fernhollow Health", industry: "Healthcare" },
  { name: "Glimmerdale Studios", industry: "Media" },
  { name: "Harborlight Systems", industry: "Software" },
  { name: "Ivyreach Labs", industry: "Biotech" },
  { name: "Juniperwell Outfitters", industry: "Retail" },
  { name: "Kestrelmark Security", industry: "Security" },
  { name: "Lanternbay Media", industry: "Media" },
  { name: "Mossgrove Architecture", industry: "Construction" },
  { name: "Northquill Finance", industry: "Financial services" },
  { name: "Oakshade Learning", industry: "Education" },
  { name: "Pebblestone Retail", industry: "Retail" },
  { name: "Quartzmere Biotech", industry: "Biotech" },
  { name: "Riverquill Travel", industry: "Travel" },
  { name: "Saltbrook Hospitality", industry: "Hospitality" },
  { name: "Thistlewood Manufacturing", industry: "Manufacturing" },
];

const FIRST_NAMES = [
  "Ava",
  "Ben",
  "Chloe",
  "Diego",
  "Elena",
  "Felix",
  "Grace",
  "Hiro",
  "Isla",
  "Jonah",
  "Kira",
  "Liam",
  "Maya",
  "Noah",
  "Olive",
  "Priya",
  "Quinn",
  "Rosa",
  "Sami",
  "Theo",
  "Uma",
  "Victor",
  "Wren",
  "Xavier",
  "Yara",
  "Zane",
  "Amara",
  "Bodhi",
  "Celine",
  "Dario",
];
const LAST_NAMES = [
  "Abernathy",
  "Bellweather",
  "Castellano",
  "Dunmore",
  "Ellsworth",
  "Fairbanks",
  "Galloway",
  "Hartwell",
  "Iverson",
  "Jarrett",
  "Kowalczyk",
  "Lindqvist",
  "Marchetti",
  "Nakamura",
  "Okafor",
  "Pemberton",
  "Quintero",
  "Rasmussen",
  "Sandoval",
  "Thornbury",
  "Underhill",
  "Valdivia",
  "Whitlock",
  "Yamaguchi",
  "Zielinski",
];
const JOB_TITLES = [
  "Head of Operations",
  "VP Sales",
  "Procurement Manager",
  "CTO",
  "Marketing Director",
  "Finance Manager",
  "Founder",
  "Product Lead",
  "IT Director",
  "Office Manager",
];
const SOURCES = ["Website", "Referral", "Conference", "Outbound", "Partner", "Webinar"];
const SIZES: CompanySize[] = [
  "SIZE_1_10",
  "SIZE_11_50",
  "SIZE_51_200",
  "SIZE_201_1000",
  "SIZE_1001_PLUS",
];
const AREA_CODES = ["212", "415", "312", "617", "206"];

const ACTIVITY_SUBJECTS: Record<ActivityType, string[]> = {
  CALL: ["Discovery call", "Pricing questions", "Follow-up call", "Check-in on rollout"],
  EMAIL: ["Sent proposal", "Shared case study", "Answered security questionnaire", "Sent recap"],
  MEETING: ["Product demo", "Kick-off meeting", "Quarterly review", "On-site workshop"],
  NOTE: [
    "Budget approved for Q1",
    "Prefers async updates",
    "Evaluating two vendors",
    "Champion moving teams",
  ],
};
const TASK_TITLES = [
  "Send revised quote",
  "Book follow-up demo",
  "Share onboarding plan",
  "Confirm decision timeline",
  "Prepare renewal options",
  "Introduce solutions engineer",
  "Collect security requirements",
  "Draft mutual action plan",
];
const DEAL_TOPICS = [
  "Annual subscription",
  "Team expansion",
  "Pilot program",
  "Analytics add-on",
  "Enterprise upgrade",
  "Multi-year renewal",
  "Onboarding package",
  "Support plan",
];
const LOST_REASONS = [
  "Chose a competitor",
  "No budget this year",
  "Went with an in-house tool",
  "Project paused",
];

async function main() {
  if (getAppEnv() === "production") {
    throw new Error("The demo seed is disabled when APP_ENV=production.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const random = createRandom(20261014);
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const daysFromNow = (days: number) => new Date(today.getTime() + days * DAY);
  const dateOnly = (days: number) =>
    new Date(`${daysFromNow(days).toISOString().slice(0, 10)}T00:00:00.000Z`);

  try {
    // Replace any previous demo workspace and demo users.
    await db.workspace.deleteMany({ where: { slug: DEMO_SLUG } });
    await db.user.deleteMany({ where: { email: { endsWith: "@demo.local" } } });

    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const users = await Promise.all(
      DEMO_ACCOUNTS.map((account) =>
        db.user.create({
          data: { email: account.email, name: account.name, passwordHash, timezone: "UTC" },
        }),
      ),
    );
    const [owner, member] = users as [(typeof users)[0], (typeof users)[0], (typeof users)[0]];
    const sellers = [owner.id, member.id];

    const workspace = await db.workspace.create({
      data: {
        name: "Cadence Demo",
        slug: DEMO_SLUG,
        currency: "USD",
        memberships: {
          create: DEMO_ACCOUNTS.map((account, index) => ({
            userId: users[index]!.id,
            role: account.role,
          })),
        },
      },
    });
    const ws = workspace.id;

    // Pipelines and stages.
    const sales = await db.pipeline.create({
      data: {
        workspaceId: ws,
        name: "Sales",
        position: 0,
        stages: {
          create: DEFAULT_STAGES.map((stage, position) => ({
            ...stage,
            position,
            workspaceId: ws,
          })),
        },
      },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    const partnerships = await db.pipeline.create({
      data: {
        workspaceId: ws,
        name: "Partnerships",
        position: 1,
        stages: {
          create: [
            { name: "Intro", probability: 15, type: "OPEN" as const },
            { name: "Evaluation", probability: 40, type: "OPEN" as const },
            { name: "Contracting", probability: 70, type: "OPEN" as const },
            { name: "Signed", probability: 100, type: "WON" as const },
            { name: "Declined", probability: 0, type: "LOST" as const },
          ].map((stage, position) => ({ ...stage, position, workspaceId: ws })),
        },
      },
      include: { stages: { orderBy: { position: "asc" } } },
    });

    // Tags and custom fields.
    const tagSpecs = [
      ["VIP", "amber"],
      ["Decision maker", "indigo"],
      ["Champion", "green"],
      ["Partner", "teal"],
      ["At risk", "red"],
      ["Newsletter", "blue"],
    ] as const;
    const tags = await Promise.all(
      tagSpecs.map(([name, color]) => db.tag.create({ data: { workspaceId: ws, name, color } })),
    );
    await db.customFieldDefinition.createMany({
      data: [
        {
          workspaceId: ws,
          entityType: "CONTACT",
          key: "linkedin",
          label: "LinkedIn profile",
          type: "TEXT",
          position: 0,
        },
        {
          workspaceId: ws,
          entityType: "CONTACT",
          key: "preferred_channel",
          label: "Preferred channel",
          type: "SELECT",
          options: ["Email", "Phone", "Video call"],
          position: 1,
        },
        {
          workspaceId: ws,
          entityType: "CONTACT",
          key: "newsletter_opt_in",
          label: "Newsletter opt-in",
          type: "BOOLEAN",
          position: 2,
        },
        {
          workspaceId: ws,
          entityType: "COMPANY",
          key: "annual_revenue_usd",
          label: "Annual revenue (USD)",
          type: "NUMBER",
          position: 0,
        },
        {
          workspaceId: ws,
          entityType: "COMPANY",
          key: "customer_since",
          label: "Customer since",
          type: "DATE",
          position: 1,
        },
        {
          workspaceId: ws,
          entityType: "DEAL",
          key: "contract_length_months",
          label: "Contract length (months)",
          type: "NUMBER",
          position: 0,
        },
        {
          workspaceId: ws,
          entityType: "DEAL",
          key: "competitor",
          label: "Competitor",
          type: "SELECT",
          options: ["None", "In-house tool", "Spreadsheets", "Another vendor"],
          position: 1,
        },
      ],
    });

    // Companies.
    const companies = [];
    for (const [index, spec] of COMPANIES.entries()) {
      const domain = `${spec.name.split(" ")[0]!.toLowerCase()}.example`;
      const customer = random.chance(0.4);
      companies.push(
        await db.company.create({
          data: {
            workspaceId: ws,
            name: spec.name,
            domain,
            industry: spec.industry,
            size: random.pick(SIZES),
            phone: `+1 (${AREA_CODES[index % AREA_CODES.length]}) 555-01${String(index).padStart(2, "0")}`,
            address: `${random.int(10, 999)} Example Street, Suite ${random.int(100, 900)}`,
            ownerId: random.pick(sellers),
            customFields: {
              annual_revenue_usd: random.int(5, 400) * 100_000,
              ...(customer
                ? { customer_since: dateOnly(-random.int(60, 900)).toISOString().slice(0, 10) }
                : {}),
            },
            tags: random.chance(0.3) ? { create: [{ tagId: tags[0]!.id }] } : undefined,
          },
        }),
      );
    }

    // Contacts: three per company on average; names are combined from fictional lists.
    const lifecycle: LifecycleStage[] = [
      "LEAD",
      "LEAD",
      "PROSPECT",
      "PROSPECT",
      "CUSTOMER",
      "CUSTOMER",
      "CHURNED",
    ];
    const contacts: Contact[] = [];
    const usedNames = new Set<string>();
    for (let index = 0; index < 60; index += 1) {
      let firstName = random.pick(FIRST_NAMES);
      let lastName = random.pick(LAST_NAMES);
      while (usedNames.has(`${firstName} ${lastName}`)) {
        firstName = random.pick(FIRST_NAMES);
        lastName = random.pick(LAST_NAMES);
      }
      usedNames.add(`${firstName} ${lastName}`);
      const company = companies[index % companies.length]!;
      const phone = `+1 (${AREA_CODES[index % AREA_CODES.length]}) 555-01${String(index + 20)
        .padStart(2, "0")
        .slice(-2)}`;
      const contactTags = tags
        .slice(1)
        .filter(() => random.chance(0.18))
        .map((tag) => ({ tagId: tag.id }));
      contacts.push(
        await db.contact.create({
          data: {
            workspaceId: ws,
            firstName,
            lastName,
            email: `${firstName}.${lastName}@${company.domain}`.toLowerCase(),
            phone,
            phoneNormalized: normalizePhone(phone),
            jobTitle: random.pick(JOB_TITLES),
            companyId: company.id,
            ownerId: random.chance(0.85) ? random.pick(sellers) : null,
            lifecycleStage: random.pick(lifecycle),
            source: random.pick(SOURCES),
            customFields: {
              preferred_channel: random.pick(["Email", "Phone", "Video call"]),
              newsletter_opt_in: random.chance(0.5),
              ...(random.chance(0.5)
                ? { linkedin: `linkedin.example/in/${firstName}-${lastName}`.toLowerCase() }
                : {}),
            },
            tags: contactTags.length > 0 ? { create: contactTags } : undefined,
            createdAt: daysFromNow(-random.int(5, 180)),
          },
        }),
      );
    }

    // Two intentional duplicates so the merge feature has something to show.
    for (const [source, variant] of [
      [contacts[3]!, { email: contacts[3]!.email!.toUpperCase(), phone: null }],
      [contacts[8]!, { email: null, phone: contacts[8]!.phone!.replace(/[()\s-]/g, "") }],
    ] as const) {
      contacts.push(
        await db.contact.create({
          data: {
            workspaceId: ws,
            firstName: source.firstName,
            lastName: source.lastName,
            email: variant.email?.toLowerCase() ?? null,
            phone: variant.phone,
            phoneNormalized: normalizePhone(variant.phone),
            jobTitle: source.jobTitle,
            lifecycleStage: "LEAD",
            source: "CSV import",
            createdAt: daysFromNow(-2),
          },
        }),
      );
    }

    // Deals spread across both pipelines and every stage.
    const salesStages = sales.stages;
    const partnerStages = partnerships.stages;
    const dealPlan: Array<{ pipeline: typeof sales; stageIndex: number }> = [
      ...[0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 4, 5, 5, 5, 1].map((stageIndex) => ({
        pipeline: sales,
        stageIndex,
      })),
      ...[0, 1, 1, 2, 3, 4].map((stageIndex) => ({ pipeline: partnerships, stageIndex })),
    ];
    const deals: Deal[] = [];
    for (const [index, plan] of dealPlan.entries()) {
      const stage = plan.pipeline.stages[plan.stageIndex]!;
      const contact = contacts[(index * 7) % 60]!;
      const company = companies.find((candidate) => candidate.id === contact.companyId)!;
      const closed = stage.type !== "OPEN";
      const closedDaysAgo = index % 3 === 0 ? random.int(100, 160) : random.int(3, 80);
      deals.push(
        await db.deal.create({
          data: {
            workspaceId: ws,
            title: `${company.name.split(" ")[0]} — ${random.pick(DEAL_TOPICS)}`,
            amount: (random.int(4, 170) * 500).toFixed(2),
            currency: "USD",
            pipelineId: plan.pipeline.id,
            stageId: stage.id,
            companyId: company.id,
            primaryContactId: contact.id,
            ownerId: random.pick(sellers),
            expectedCloseDate: closed ? dateOnly(-closedDaysAgo) : dateOnly(random.int(-5, 70)),
            closedAt: closed ? daysFromNow(-closedDaysAgo) : null,
            lostReason: stage.type === "LOST" ? random.pick(LOST_REASONS) : null,
            customFields: {
              contract_length_months: random.pick([6, 12, 24, 36]),
              competitor: random.pick(["None", "In-house tool", "Spreadsheets", "Another vendor"]),
            },
            createdAt: daysFromNow(-random.int(closed ? 170 : 10, 200)),
          },
        }),
      );
    }

    // Activities on contacts (and their deals).
    const activityTypes: ActivityType[] = ["CALL", "EMAIL", "MEETING", "NOTE"];
    const activities: Prisma.ActivityCreateManyInput[] = [];
    for (const contact of contacts.slice(0, 60)) {
      const deal = deals.find((candidate) => candidate.primaryContactId === contact.id);
      for (let count = random.int(1, 3); count > 0; count -= 1) {
        const type = random.pick(activityTypes);
        activities.push({
          workspaceId: ws,
          type,
          subject: random.pick(ACTIVITY_SUBJECTS[type]),
          body: random.chance(0.5)
            ? "Discussed goals, timeline and next steps. Notes shared with the team."
            : null,
          occurredAt: new Date(
            daysFromNow(-random.int(0, 60)).getTime() - random.int(0, 8) * 3_600_000,
          ),
          contactId: contact.id,
          companyId: contact.companyId,
          dealId: deal && random.chance(0.6) ? deal.id : null,
          authorId: random.pick(sellers),
        });
      }
    }
    await db.activity.createMany({ data: activities });

    // Tasks: overdue, due today, upcoming and completed.
    const priorities: TaskPriority[] = ["LOW", "MEDIUM", "MEDIUM", "HIGH"];
    const taskOffsets = [
      -6,
      -3,
      -1,
      0,
      0,
      0,
      1,
      2,
      3,
      5,
      6,
      9,
      12,
      20,
      null,
      -10,
      -4,
      -2,
      0,
      4,
      7,
      15,
      -8,
      -1,
      2,
      30,
    ];
    await db.task.createMany({
      data: taskOffsets.map((offset, index) => {
        const contact = contacts[(index * 5) % 60]!;
        const deal = deals[index % deals.length]!;
        const completed = index % 6 === 5;
        return {
          workspaceId: ws,
          title: random.pick(TASK_TITLES),
          dueAt:
            offset === null
              ? null
              : new Date(daysFromNow(offset).getTime() + random.int(-3, 5) * 3_600_000),
          completedAt: completed ? daysFromNow(-random.int(0, 5)) : null,
          priority: random.pick(priorities),
          assigneeId: sellers[index % 2]!,
          createdById: owner.id,
          contactId: index % 3 === 0 ? null : contact.id,
          dealId: index % 3 === 0 ? deal.id : null,
        };
      }),
    });

    // A starting audit trail.
    await db.auditLog.createMany({
      data: [
        {
          workspaceId: ws,
          actorId: owner.id,
          action: "workspace.created",
          entityType: "workspace",
          entityId: ws,
          changes: { name: workspace.name },
          createdAt: daysFromNow(-200),
        },
        ...users.slice(1).map((user, index) => ({
          workspaceId: ws,
          actorId: owner.id,
          action: "member.added",
          entityType: "member",
          entityId: user.id,
          changes: { email: user.email, role: DEMO_ACCOUNTS[index + 1]!.role },
          createdAt: daysFromNow(-199),
        })),
        ...deals
          .filter((deal) => deal.closedAt)
          .map((deal) => ({
            workspaceId: ws,
            actorId: deal.ownerId,
            action: "deal.stage_changed",
            entityType: "deal",
            entityId: deal.id,
            changes: {
              stage: {
                from: "Negotiation",
                to:
                  [...salesStages, ...partnerStages].find((stage) => stage.id === deal.stageId)
                    ?.name ?? "",
              },
            },
            createdAt: deal.closedAt!,
          })),
      ],
    });

    const summary = {
      companies: companies.length,
      contacts: contacts.length,
      deals: deals.length,
      activities: activities.length,
      tasks: taskOffsets.length,
    };
    console.log(`Seeded "${workspace.name}":`, summary);
    console.log(
      `Demo sign-in: ${DEMO_ACCOUNTS.map((account) => account.email).join(", ")} / ${DEMO_PASSWORD}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
