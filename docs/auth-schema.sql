-- Reference PostgreSQL schema only. Execute later on a protected backend.
-- Never include real credentials, seed passwords or photo bytes in this file.
BEGIN;
CREATE TABLE emma_accounts (
  id uuid PRIMARY KEY,
  email_normalized text NOT NULL UNIQUE CHECK (email_normalized=lower(btrim(email_normalized)) AND length(email_normalized)>0),
  password_hash text, -- null only for an OAuth-only account with a linked identity
  role text NOT NULL DEFAULT 'applicant' CHECK (role IN ('applicant','emma','admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
  email_verified_at timestamptz,
  photo_storage_key text, -- private object-storage key; never a public URL
  photo_consent_at timestamptz,
  photo_reviewed_at timestamptz,
  registration_completed_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES emma_accounts(id),
  CHECK (role NOT IN ('emma','admin') OR status <> 'approved' OR email_verified_at IS NOT NULL),
  CHECK (role <> 'emma' OR status <> 'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND photo_reviewed_at IS NOT NULL AND photo_consent_at IS NOT NULL AND registration_completed_at IS NOT NULL))
);
-- Database-enforced cardinality, including concurrent approval transactions.
CREATE UNIQUE INDEX one_active_emma ON emma_accounts(role) WHERE role='emma' AND status='approved';
CREATE UNIQUE INDEX one_active_owner ON emma_accounts(role) WHERE role='admin' AND status='approved';
CREATE TABLE emma_auth_identities (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES emma_accounts(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider='google'),
  subject text NOT NULL CHECK (length(subject)>0), -- Google's verified stable sub
  UNIQUE(provider,subject),
  UNIQUE(account_id,provider)
);
CREATE TABLE emma_sessions (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES emma_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE, -- hash of a high-entropy random session secret
  csrf_token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE emma_approval_audit (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES emma_accounts(id),
  reviewed_by uuid NOT NULL REFERENCES emma_accounts(id),
  action text NOT NULL CHECK (action IN ('approved','rejected','revoked')),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
-- Backend must additionally enforce owner-only review, verified email,
-- pending-only approval, session expiry/revocation and per-request authorization.
