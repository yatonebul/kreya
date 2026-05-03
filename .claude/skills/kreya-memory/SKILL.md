---
name: kreya-memory
description: Use this skill when starting any kreya session, when the user asks about project state, or when you want to remember something for next time. Loads and manages session memory beyond what claude-context.json contains.
tools: Read, Edit
version: 1.0.0
---

# Kreya Session Memory Skill

## On session start

Read `.claude/kreya-session-memory.md`. It contains facts that are NOT in `claude-context.json` — treat them as additive context. Do not re-read `claude-context.json` if it's already loaded.

The SessionStart hook already injects this file as a system prefix, so only re-read it if you need to verify a specific fact.

## On session end (or when user says "remember this")

Update `.claude/kreya-session-memory.md` using the Edit tool:
- Add new facts under `## Extra facts` as bullet points
- Format: `- [YYYY-MM-DD] <fact>`
- Only add facts that are NOT already in `claude-context.json`
- De-duplicate: if an existing fact is superseded, replace it
- Update the `<!-- Last updated: -->` comment with today's date
- Keep the list short (< 20 bullets); promote older facts to `claude-context.json` if they become permanent

## What belongs here vs claude-context.json

| Here (session memory) | claude-context.json |
|----------------------|---------------------|
| Temporary workarounds | Architecture decisions |
| Recent test results | Tech stack / IDs |
| In-progress investigations | Completed features |
| User preferences discovered | Brand / style rules |
| Known bugs being tracked | API integrations |
