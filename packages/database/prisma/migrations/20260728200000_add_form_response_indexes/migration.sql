-- Keep paginated form-response screens fast as submission volumes grow.
CREATE INDEX IF NOT EXISTS "custom_form_submissions_formId_createdAt_idx"
  ON "custom_form_submissions"("formId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "recruitment_candidatures_formId_createdAt_idx"
  ON "recruitment_candidatures"("formId", "createdAt" DESC);
