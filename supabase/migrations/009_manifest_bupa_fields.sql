-- Adds the Bupa-form-specific fields, plus the two cross-insurer rationale
-- fields, to manifest_reports. Run once in the SQL Editor. Safe to run even
-- if some of these already exist, "if not exists" guards every column.

alter table manifest_reports add column if not exists no_measures_reason text;
alter table manifest_reports add column if not exists deterioration_rationale text;
alter table manifest_reports add column if not exists diagnosis text;
alter table manifest_reports add column if not exists modality text;
alter table manifest_reports add column if not exists modality_change_reason text;
alter table manifest_reports add column if not exists session_frequency text;
alter table manifest_reports add column if not exists last_session_date date;
alter table manifest_reports add column if not exists treatment_break text;
alter table manifest_reports add column if not exists other_professionals text;
alter table manifest_reports add column if not exists concludes_treatment text;
alter table manifest_reports add column if not exists further_goals text;
alter table manifest_reports add column if not exists risk_assessment_date date;
alter table manifest_reports add column if not exists risk_level text;
alter table manifest_reports add column if not exists risk_plan text;
