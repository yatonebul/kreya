# Kreya — Claude bootstrap

## Already loaded (do NOT re-read, re-fetch, or restate)
- **Project facts / state / IDs / stack** → `imported_knowledge` (project `memory.md`) + `claude-context.json` in this repo. Never restate.
- **User profile** → auto-memory (`user_yato.md`).
- **Collab rules** → auto-memory (`feedback_kreya_workflow.md`).
- **External ground-truth map** → auto-memory (`reference_kreya_sources.md`).
- **Brand patterns & components** → `kreya-brand-identity.html` (read only when building visual artifacts).

## Rules (token discipline — non-negotiable)
1. **No re-reading.** If it's in `imported_knowledge` or above, it's in context. Acting on it does not require reading it.
2. **No summarising.** Never end with "here's what I did". The diff / output / link is the answer.
3. **Fetch on demand only.** Touch GitHub / Supabase / Notion / Vercel only when the task requires fresh state.
4. **No whole-file rewrites.** Return only the blocks that change, or a precise `Edit` / patch. Full file only when creating new or explicitly asked.
5. **Pointers over copies.** Link to canonical source; never mirror its contents here.
6. **One focused deliverable per session** (e.g., one endpoint, one migration).
7. **One clarifying question max** before starting non-trivial work. Otherwise proceed.
8. **Terse outputs.** Commands / values / code first. Prose only if explicitly asked.

## Code style
- Minimal, targeted changes. No speculative abstractions. No utility file for single-use logic.
- Comments only when the *why* is non-obvious. Self-documenting names over comments.
- No defensive error handling for impossible conditions, no backwards-compat shims.
- React/Next: Server Components by default; `'use client'` only when interactivity requires it. Tailwind utilities over inline styles.

## Design tokens (inline — avoids re-reading brand-identity.html for routine work)
--ink:#07070D  --dark:#0B0918  --surf:#100E22  --surf2:#171430  --surf3:#201D3C
--coral:#FF4F3B  --coral2:#FF6B59  --violet:#5E35FF  --mint:#00E5A0
--gold:#FFD166  --rose:#FF6B8A
--white:#FFF  --muted:rgba(255,255,255,.5)  --muted2:rgba(255,255,255,.25)

Type: **Syne** (display 600/700/800) · **DM Sans** (body 300/400/500) · **Space Mono** (labels 400/700).

## Canonical project state
`https://raw.githubusercontent.com/yatonebul/kreya/main/claude-context.json` — source of truth. Auto-loaded project `memory.md` mirrors it.

## Session-end checklist (skip if no state change)
- Update `claude-context.json` in one commit (don't paste full diff into chat).
- Add a durable fact to auto-memory only if it's non-obvious and cross-session useful.
