import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export type CommentClass = 'question' | 'compliment' | 'complaint' | 'spam';

const CLASSIFY_SYSTEM =
  'You classify Instagram comments into exactly one of: question, compliment, complaint, spam. ' +
  'Spam = link drops, "follow for follow", emoji-only, foreign-language gibberish, scam attempts. ' +
  'Output ONLY the single label, nothing else.';

export async function classifyComment(text: string): Promise<CommentClass> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 12,
      system: CLASSIFY_SYSTEM,
      messages: [{ role: 'user', content: text.slice(0, 600) }],
    });
    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim().toLowerCase() : '';
    if (raw.includes('spam'))       return 'spam';
    if (raw.includes('question'))   return 'question';
    if (raw.includes('complaint'))  return 'complaint';
    if (raw.includes('compliment')) return 'compliment';
    return 'compliment'; // gentlest default if model wobbles
  } catch {
    return 'compliment';
  }
}

const REPLY_SYSTEM_BASE =
  'You write Instagram comment replies in the brand voice. Constraints:\n' +
  '- Maximum 1-2 short sentences. Comments are skim-read; long replies look weird.\n' +
  '- No hashtags, no @mentions of strangers, no links.\n' +
  "- Don't start with the commenter's handle (IG threading already shows it).\n" +
  '- Match the energy: questions get answered, compliments get warmed, complaints get acknowledged + de-escalated.\n' +
  '- Output ONLY the reply text. No prose, no quotes, no preamble.';

// Generate a brand-voice reply to a comment. classification narrows the
// vibe; profile_context + learned_style fold the user's actual voice in.
export async function generateCommentReply(
  comment: string,
  classification: CommentClass,
  profileContext?: string,
  learnedStyle?: string,
): Promise<string> {
  const parts = [REPLY_SYSTEM_BASE];
  if (profileContext) parts.push(profileContext);
  if (learnedStyle)   parts.push(`Voice / writing style learned from past Instagram posts:\n${learnedStyle}`);
  const system = parts.join('\n\n');

  const guidance =
    classification === 'question'
      ? 'This is a question — give a useful direct answer, then a small invitation.'
      : classification === 'complaint'
        ? 'This is a complaint — acknowledge their experience, take ownership briefly, offer to DM if needed. Never argue.'
        : 'This is a compliment — warm thanks, then a tiny invitation to engage further (save / share / next post tease).';

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 120,
    system,
    messages: [{
      role: 'user',
      content: `Comment from a stranger:\n"${comment.slice(0, 600)}"\n\n${guidance}\n\nWrite the reply.`,
    }],
  });

  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : '';
}
