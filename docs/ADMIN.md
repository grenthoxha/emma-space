# Owner administration

Panel: `https://grenthoxha.github.io/emma-space/admin.html`.

The owner requested **one administrator plus one approved app user**, with no hard-coded email. The owner enters their email/password privately in the panel. Registration creates an ordinary Supabase Auth account; it never grants administrator access. The main app introduction and personal features are unchanged.

## Provisioning the first administrator

1. In the panel, choose “Konfigurimi i parë · Krijo llogarinë”. Enter your own email and a unique password, then verify the email. The configured SMTP restrictions described in `SUPABASE.md` still apply.
2. As the authenticated Supabase project owner, run `supabase-admin-assign.sql` in SQL Editor with that actual verified email. This resolves the Auth UUID and inserts it into the private administrator registry. Do not publish a completed copy containing your email or any password. The script refuses to replace another active administrator silently.
3. Return to the panel and sign in or select “Kontrollo aktivizimin”. Only a server-verified member of the private registry can see requests and photographs.

The owner email is not yet selected and no live administrator has been assigned. Creating a public account first does not make it the owner. There is no demo administrator or default password.

## Deployed backend

`supabase-admin-setup.sql` has been applied to the same project after `supabase-setup.sql`. The existing partial unique index for **one approved user** is retained. A second partial unique index allows only **one enabled administrator**. Membership is stored in `emma_private.administrators`, never user-editable Auth metadata.

RLS lets the administrator read submitted requests/photos and update review status. Ordinary applicants still see only their own records and cannot set review status. A private trigger checks the live administrator registry and verified Auth email, prevents self-approval and changing someone else's photo, derives the displayed applicant email from Auth and records status decisions in `emma_access_reviews`. No privileged server key is shipped.

The browser uses a narrow `SECURITY INVOKER` RPC to check its own role; the privileged membership helper is in a non-exposed private schema. The registry has no direct client table grants/policies, deliberately denying direct reads/writes (Security Advisor may show an informational “RLS Enabled No Policy” note for this private table). The owner can disable membership immediately in Supabase.

## Using the panel

- View the applicant email, submission time and private live-capture photograph.
- Choose **Prano**, **Refuzo**, or **Hiq qasjen**, then explicitly confirm the chosen decision.
- To accept a different user, first revoke the active user's access. The database blocks simultaneous second approvals even if someone bypasses disabled buttons.
- Every decision rechecks membership and includes the request's previous status. A stale decision does not overwrite a newer decision.
- Filters show pending, accepted or all requests. The panel shows up to 200 recent requests.

The panel does not upload or display anyone's diary, study history or routines. It is a separate owner page, not an extra item in Emma's navigation.

## Sessions and verification

Admin sessions use the separate tab-local `emma-space-admin-session` key, independent of the app user's session. Private requests and photo downloads bypass all offline caches. Photos use temporary Blob URLs that are revoked when leaving/hiding the panel; private content is cleared on page hiding/offline and permissions are verified again on return. The panel checks status periodically while visible and idle. Logout clears only the administrator session.

Hosted SQL tests in `supabase-admin-test.sql` passed: no metadata-based administrator grant, no self-grant or self-approval, own-only applicant visibility, authorized owner review of private photos, blocked second user, review audit and disabled-admin revocation. All synthetic fixtures were rolled back. Follow-up counts were **0 test users, 0 live administrators, 0 approved users** before the owner's signup. Security Advisor was rerun: **0 errors, 0 warnings**, one expected informational note for the private denied registry.

Client tests: `node tools/test-admin-service.cjs`. The real owner account signup, email delivery and end-to-end review from the signed-in panel still require the owner's credential entry and activation; automated fixtures do not substitute for this final check.
