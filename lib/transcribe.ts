function getToken() { return process.env.WHATSAPP_ACCESS_TOKEN!; }
function getGroqKey() { return process.env.GROQ_API_KEY!; }

export async function transcribeVoice(mediaId: string, mimeType: string): Promise<string> {
  // 1. Get temp download URL from Meta
  const urlRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  const urlData = await urlRes.json();
  if (!urlData.url) throw new Error(`No download URL for audio ${mediaId}`);

  // 2. Download bytes
  const fileRes = await fetch(urlData.url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!fileRes.ok) throw new Error(`Audio download failed: ${fileRes.status}`);
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  // 3. Send to Groq Whisper
  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'wav';
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: 'audio/ogg' }), `voice.${ext}`);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'json');

  const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getGroqKey()}` },
    body: formData,
  });
  const groqData = await groqRes.json();
  if (!groqRes.ok) throw new Error(`Groq transcription failed: ${JSON.stringify(groqData)}`);

  return groqData.text?.trim() ?? '';
}
