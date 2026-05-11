# Security Hardening Deployment Checklist

**Status:** Ready for deployment  
**Branch:** `claude/secure-supabase-config-x6cVj`  
**Implemented:** Token encryption, RLS policies, secret validation  
**Timeline:** ~15 min per step, total 45-60 min

---

## Pre-Deployment ✓

- [x] Token encryption implemented (AES-256-GCM)
- [x] RLS policies defined
- [x] Secret validation added (OTP_SECRET, SETUP_KEY)
- [x] Code changes committed & pushed
- [x] Migration files prepared

---

## Step 1: Generate & Set Vercel Secrets (5 min)

### Generate 3 random secrets:
```bash
# Run in terminal (macOS/Linux)
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('OTP_SECRET=' + require('crypto').randomBytes(16).toString('hex'))"
node -e "console.log('SETUP_KEY=' + require('crypto').randomBytes(16).toString('hex'))"
```

### Set in Vercel:
1. Go to: **Vercel Dashboard → Project Settings → Environment Variables**
2. Add three new variables:
   - `ENCRYPTION_KEY` = (generated value)
   - `OTP_SECRET` = (generated value)
   - `SETUP_KEY` = (generated value)
3. Verify all 3 variables are set to **Production**
4. **Redeploy:** Click "Redeploy" to apply changes

**⚠️ Critical:** Don't skip this step — the app will fail to start without these secrets.

---

## Step 2: Run Supabase SQL Migrations (10 min)

### Go to Supabase Dashboard → SQL Editor
https://supabase.com/dashboard/project/kuwkdxahsugsfblgbetk/sql

### Migration 1: Token Encryption Setup
1. Click **New query**
2. Open `supabase/encrypt_instagram_tokens.sql` from repo
3. Copy entire contents
4. Paste into SQL editor
5. Click **Run** (or Cmd/Ctrl+Enter)
6. Verify success: No errors shown

**Expected output:**
```
NOTICE: extension "pgcrypto" already exists, skipping CREATE EXTENSION
Query executed successfully
```

---

### Migration 2: Row-Level Security Policies
1. Click **New query** (same editor)
2. Open `supabase/add_rls_policies.sql` from repo
3. Copy entire contents
4. Paste into SQL editor
5. Click **Run**
6. Verify success: "Query executed successfully" × 12 policies

**Expected output:**
```
CREATE POLICY
CREATE POLICY
... (12 total)
```

---

### (Optional) Verify RLS is enabled:
Run this query to confirm:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

All rows should show `rowsecurity = true`.

---

## Step 3: Backfill Existing Tokens (5 min — Optional)

**If users have already linked Instagram accounts before this deployment:**

Run in Supabase SQL editor:
```sql
UPDATE instagram_accounts 
SET access_token_encrypted = pgp_sym_encrypt(access_token, '<ENCRYPTION_KEY>')
WHERE access_token IS NOT NULL 
  AND access_token_encrypted IS NULL;
```

Replace `<ENCRYPTION_KEY>` with the value you set in Vercel.

**If no users have linked yet:** Skip this step.

---

## Step 4: Deploy & Smoke Test (10 min)

### 1. Redeploy to Vercel (if not already done in Step 1)
- Vercel should auto-detect the code push
- Or manually: **Deployments → Redeploy** latest

### 2. Wait for build to complete (3-5 min)
- Check for build errors
- Expected: No startup errors (if secrets are set)

### 3. Test: Link Instagram Account
1. Go to your app: https://kreya-github.vercel.app
2. Start onboarding
3. Link Instagram account
4. Verify success: "Connected!" message

### 4. Test: Token Refresh Cron
- Check cron logs: **Vercel Dashboard → Functions → Logs**
- Filter for: `/api/cron/refresh-instagram-tokens`
- Expected: Recent success or "No tokens due for refresh"
- Error logs would show `decryptToken failed` if ENCRYPTION_KEY is wrong

### 5. Verify in Supabase:
- Go to **Table Editor → instagram_accounts**
- Find the account you just linked
- Column `access_token_encrypted` should have a value like: `<hex>:<hex>:<hex>`
- Column `access_token` should be empty/null (old plaintext, can be deleted later)

---

## Step 5: Clean Up (Optional — Tomorrow)

### Once all existing accounts are migrated:
```sql
-- Drop the plaintext access_token column (AFTER backfill + verification)
ALTER TABLE instagram_accounts DROP COLUMN access_token;
```

---

## Rollback Plan (if anything breaks)

1. **Secret validation prevents startup?**
   - Ensure ENCRYPTION_KEY, OTP_SECRET, SETUP_KEY are all set in Vercel
   - Check for typos (case-sensitive)

2. **Token decryption fails?**
   - ENCRYPTION_KEY was changed or is wrong
   - Use the value you set in Step 1
   - If lost, generate a new one and re-backfill tokens

3. **RLS blocks legitimate access?**
   - Service-role key should bypass RLS (it does by default)
   - Verify in `app/api/auth/instagram/callback/route.ts` uses service-role client
   - Revert `add_rls_policies.sql` if needed: Go to SQL editor, run `DROP POLICY ...` for each policy

4. **Need to restore plaintext tokens?**
   ```sql
   -- Decrypt back to plaintext (requires ENCRYPTION_KEY)
   UPDATE instagram_accounts 
   SET access_token = pgp_sym_decrypt(access_token_encrypted, '<ENCRYPTION_KEY>')
   WHERE access_token_encrypted IS NOT NULL;
   ```

---

## Post-Deployment Verification

- [ ] Vercel build succeeded (no startup errors)
- [ ] ENCRYPTION_KEY, OTP_SECRET, SETUP_KEY all set in Vercel
- [ ] Supabase: RLS policies created (12 total)
- [ ] Supabase: pgcrypto extension enabled
- [ ] Test: Instagram account link works
- [ ] Test: Token stored encrypted (`access_token_encrypted` has value)
- [ ] Test: Token refresh cron runs without errors
- [ ] Test: Existing sessions still work (OTP auth, magic links)

---

## Timeline

| Step | Task | Time |
|------|------|------|
| 1 | Generate & set Vercel secrets | 5 min |
| 2 | Run Supabase migrations | 10 min |
| 3 | Backfill tokens (optional) | 5 min |
| 4 | Deploy & smoke test | 10 min |
| 5 | Clean up (optional) | 5 min |
| **Total** | | **35-45 min** |

---

## Files Modified This Session

**SQL Migrations:**
- `supabase/encrypt_instagram_tokens.sql` — pgcrypto + encryption setup
- `supabase/add_rls_policies.sql` — 12 RLS policies for 8 tables

**Code Changes:**
- `lib/encryption.ts` — AES-256-GCM encryption library (NEW)
- `lib/session.ts` — OTP_SECRET validation
- `app/api/db-setup/route.ts` — SETUP_KEY validation
- `app/api/auth/instagram/callback/route.ts` — Encrypt tokens on store
- `app/api/cron/refresh-instagram-tokens/route.ts` — Decrypt/refresh/re-encrypt

**Documentation:**
- `.env.example` — Updated with new required variables
- `SECURITY_DEPLOYMENT.md` — This checklist

---

## Questions?

- **Encryption Key Lost?** Generate a new one, update Vercel, re-backfill tokens with new key
- **Supabase Error?** Check SQL syntax in migration files; run one statement at a time if needed
- **Token Refresh Fails?** Check Vercel logs for "ENCRYPTION_KEY" errors; verify key matches
- **RLS Too Restrictive?** Service-role key bypasses RLS — if legitimate access is blocked, revert policies

**Next Session:** Execute this checklist to finalize security hardening.
