-- Every activity belongs to at least one contact, company or deal. Deleting a record removes
-- the activities that only belonged to it, so none become unreachable. Older rows without any
-- link (left behind before that rule) cannot be shown anywhere and are removed first.
DELETE FROM "Activity" WHERE "contactId" IS NULL AND "companyId" IS NULL AND "dealId" IS NULL;

ALTER TABLE "Activity"
  ADD CONSTRAINT "Activity_has_link"
  CHECK ("contactId" IS NOT NULL OR "companyId" IS NOT NULL OR "dealId" IS NOT NULL);
