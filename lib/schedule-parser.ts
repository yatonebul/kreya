import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SCHEDULE_PATTERN = /\b(schedule|post at|send at|publish at|tomorrow|today|tonight|next\s+\w+|in \d+\s*(hour|minute|day|hr|min)|at \d{1,2}(:\d{2})?\s*(am|pm)?|\d{1,2}:\d{2}\s*(am|pm)|\d{1,2}\s*(am|pm)|best\s*time)\b/i;

export function hasScheduleIntent(text: string): boolean {
  return SCHEDULE_PATTERN.test(text);
}

export async function parseScheduleTime(instruction: string): Promise<Date | null> {
  const now = new Date();
  // Give Claude the current UTC time AND the user's local time so it can resolve
  // "today 6:50pm CEST" / "in 2 minutes" correctly without timezone ambiguity.
  const localStr = now.toLocaleString('en-GB', {
    timeZone: 'Europe/Prague',
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 40,
    system: `Convert a scheduling instruction to an ISO 8601 UTC timestamp.
Current UTC time: ${now.toISOString()}
Current local time (Europe/Prague): ${localStr}
User timezone: Europe/Prague (CEST = UTC+2 in summer, CET = UTC+1 in winter).
Return ONLY the ISO timestamp (e.g. 2026-05-19T16:50:00.000Z). If the instruction is ambiguous or unparseable, return the word "null".`,
    messages: [{ role: 'user', content: instruction }],
  });
  const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
  if (!text || text === 'null') return null;
  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

export function formatScheduleConfirmation(date: Date): string {
  return date.toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zagreb',
  });
}
