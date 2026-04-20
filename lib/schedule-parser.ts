import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const SCHEDULE_PATTERN = /\b(schedule|post at|send at|publish at|tomorrow|tonight|tonight|next\s+\w+|in \d+\s*(hour|minute|day|hr|min)|at \d{1,2}(:\d{2})?\s*(am|pm)?)\b/i;

export function hasScheduleIntent(text: string): boolean {
  return SCHEDULE_PATTERN.test(text);
}

export async function parseScheduleTime(instruction: string): Promise<Date | null> {
  const now = new Date();
  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 40,
    system: `Parse scheduling instructions into ISO 8601 UTC timestamps. Current local time: ${now.toISOString()}. Return ONLY the ISO timestamp (e.g. 2026-04-20T18:00:00.000Z). If unparseable, return null.`,
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
