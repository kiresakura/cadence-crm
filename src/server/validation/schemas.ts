import { z } from "zod";

import {
  ActivityType,
  CompanySize,
  CustomFieldEntity,
  CustomFieldType,
  LifecycleStage,
  Role,
  StageType,
  TaskPriority,
} from "@/generated/prisma/enums";

import { MIN_PASSWORD_LENGTH } from "../auth/password";
import { isReservedFieldKey } from "../domain/custom-fields";
import {
  currencySchema,
  customFieldsInput,
  idList,
  moneySchema,
  optionalDate,
  optionalDateTime,
  optionalEmail,
  optionalId,
  optionalText,
  requiredText,
} from "./common";

const email = z
  .string({ error: "Email is required." })
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

const password = z
  .string({ error: "Password is required." })
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(200, "Password is too long.");

export const loginSchema = z.object({
  email,
  password: z.string({ error: "Password is required." }).min(1, "Password is required."),
});

export const registerSchema = z.object({
  name: requiredText("Name", 100),
  email,
  password,
  workspaceName: requiredText("Workspace name", 80),
  timezone: z.string().trim().max(64).optional(),
});

export const profileSchema = z.object({
  name: requiredText("Name", 100),
  timezone: z.string().trim().min(1, "Choose a time zone.").max(64),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "Enter your current password." })
      .min(1, "Enter your current password."),
    newPassword: password,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "Choose a password you have not used here.",
    path: ["newPassword"],
  });

export const workspaceSchema = z.object({
  name: requiredText("Workspace name", 80),
});

export const contactSchema = z.object({
  firstName: requiredText("First name", 100),
  lastName: requiredText("Last name", 100),
  email: optionalEmail,
  phone: optionalText(50),
  jobTitle: optionalText(120),
  companyId: optionalId,
  ownerId: optionalId,
  lifecycleStage: z.enum(LifecycleStage).default("LEAD"),
  source: optionalText(80),
  tagIds: idList,
  customFields: customFieldsInput,
});
export type ContactInput = z.output<typeof contactSchema>;

export const companySchema = z.object({
  name: requiredText("Company name", 160),
  domain: optionalText(253).refine(
    (value) => value === null || /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value),
    { message: "Enter a domain like example.com." },
  ),
  industry: optionalText(80),
  size: z
    .enum(CompanySize)
    .nullish()
    .or(z.literal(""))
    .transform((value) => (value ? value : null)),
  phone: optionalText(50),
  address: optionalText(300),
  ownerId: optionalId,
  tagIds: idList,
  customFields: customFieldsInput,
});
export type CompanyInput = z.output<typeof companySchema>;

export const dealSchema = z.object({
  title: requiredText("Title", 160),
  amount: moneySchema,
  currency: currencySchema,
  pipelineId: requiredText("Pipeline", 64),
  stageId: requiredText("Stage", 64),
  companyId: optionalId,
  primaryContactId: optionalId,
  ownerId: optionalId,
  expectedCloseDate: optionalDate,
  lostReason: optionalText(300),
  customFields: customFieldsInput,
});
export type DealInput = z.output<typeof dealSchema>;

export const moveDealSchema = z.object({
  stageId: requiredText("Stage", 64),
  lostReason: optionalText(300),
});

export const activitySchema = z
  .object({
    type: z.enum(ActivityType),
    subject: requiredText("Subject", 200),
    body: optionalText(5000),
    occurredAt: optionalDateTime,
    contactId: optionalId,
    companyId: optionalId,
    dealId: optionalId,
  })
  .refine((value) => value.contactId || value.companyId || value.dealId, {
    message: "Link the activity to a contact, company or deal.",
    path: ["_form"],
  });
export type ActivityInput = z.output<typeof activitySchema>;

export const taskSchema = z.object({
  title: requiredText("Title", 200),
  dueAt: optionalDateTime,
  priority: z.enum(TaskPriority).default("MEDIUM"),
  assigneeId: optionalId,
  contactId: optionalId,
  companyId: optionalId,
  dealId: optionalId,
});
export type TaskInput = z.output<typeof taskSchema>;

export const tagSchema = z.object({
  name: requiredText("Name", 40),
  color: z
    .enum(["slate", "red", "amber", "green", "teal", "blue", "indigo", "pink"])
    .default("slate"),
});
export type TagInput = z.output<typeof tagSchema>;

export const pipelineSchema = z.object({
  name: requiredText("Pipeline name", 80),
});

export const stageSchema = z.object({
  name: requiredText("Stage name", 60),
  probability: z.coerce
    .number({ error: "Enter a probability." })
    .int("Use a whole number.")
    .min(0, "Probability must be between 0 and 100.")
    .max(100, "Probability must be between 0 and 100."),
  type: z.enum(StageType).default("OPEN"),
});
export type StageInput = z.output<typeof stageSchema>;

export const customFieldDefinitionSchema = z
  .object({
    entityType: z.enum(CustomFieldEntity),
    label: requiredText("Label", 60),
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,39}$/, "Use lowercase letters, digits and underscores.")
      .refine((key) => !isReservedFieldKey(key), "This key is reserved. Choose another.")
      .optional(),
    type: z.enum(CustomFieldType),
    options: z
      .union([z.array(z.string()), z.string()])
      .default([])
      .transform((value) =>
        (Array.isArray(value) ? value : value.split(/\r?\n|,/))
          .map((option) => option.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().max(60)).max(50)),
    required: z
      .union([z.boolean(), z.enum(["true", "false", "on"])])
      .default(false)
      .transform((value) => value === true || value === "true" || value === "on"),
  })
  .refine((value) => value.type !== "SELECT" || value.options.length > 0, {
    message: "Add at least one option for a select field.",
    path: ["options"],
  });
export type CustomFieldDefinitionInput = z.output<typeof customFieldDefinitionSchema>;

export const invitationSchema = z.object({
  email,
  role: z.enum(Role).default("MEMBER"),
});

/** Sign-up through an invitation link: the email always comes from the invitation. */
export const invitationRegisterSchema = z.object({
  token: z.string({ error: "This invitation link is invalid." }).trim().min(1).max(200),
  name: requiredText("Name", 100),
  password,
  timezone: z.string().trim().max(64).optional(),
});

export const changeRoleSchema = z.object({
  role: z.enum(Role),
});

export const removeMemberSchema = z.object({
  /** Who takes over the member's records and open tasks; defaults to the person removing. */
  transferToUserId: optionalId,
});
