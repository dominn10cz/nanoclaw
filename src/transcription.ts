/**
 * Voice transcription via OpenAI Whisper API.
 *
 * Channel-agnostic — called from chat-sdk-bridge.messageToInbound for any
 * attachment whose `type === 'audio'`. The bridge already downloaded the
 * media into a base64 buffer; we run it through Whisper and return text
 * for the bridge to splice into the inbound message before it reaches
 * the router.
 *
 * Ported from v1 (src/transcription.ts) but generalised — v1 was bound to
 * Baileys/WhatsApp; this version takes a raw Buffer + mimeType so any
 * channel adapter can use it.
 *
 * Failures return null. Caller decides the fallback (typically: leave
 * the original `[audio: ...]` reference in the message and let the agent
 * either ignore or ask the user).
 */
import { readEnvFile } from './env.js';
import { log } from './log.js';

const WHISPER_MODEL = 'whisper-1';
const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25 MB — OpenAI hard limit

/**
 * Map a mimeType to a filename Whisper will accept. Whisper supports
 * mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg. Telegram voice notes are
 * audio/ogg with opus codec; Telegram audio uploads are typically m4a.
 */
function filenameFor(mimeType: string | undefined): string {
  if (!mimeType) return 'voice.ogg';
  const lower = mimeType.toLowerCase();
  if (lower.includes('ogg')) return 'voice.ogg';
  if (lower.includes('mp4') || lower.includes('m4a')) return 'audio.m4a';
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'audio.mp3';
  if (lower.includes('wav')) return 'audio.wav';
  if (lower.includes('webm')) return 'audio.webm';
  return 'voice.ogg';
}

let apiKeyCache: string | null | undefined;

function getApiKey(): string | null {
  if (apiKeyCache !== undefined) return apiKeyCache;
  const env = readEnvFile(['OPENAI_API_KEY']);
  apiKeyCache = env.OPENAI_API_KEY ?? null;
  if (!apiKeyCache) {
    log.warn('OPENAI_API_KEY not set in .env — voice transcription disabled');
  }
  return apiKeyCache;
}

export async function transcribeAudio(buffer: Buffer, mimeType: string | undefined): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  if (buffer.length === 0) {
    log.warn('transcribeAudio called with empty buffer');
    return null;
  }
  if (buffer.length > WHISPER_MAX_BYTES) {
    log.warn('Audio exceeds Whisper 25 MB limit, skipping transcription', {
      bytes: buffer.length,
    });
    return null;
  }

  try {
    const { default: OpenAI, toFile } = await import('openai');
    const client = new OpenAI({ apiKey });
    const file = await toFile(buffer, filenameFor(mimeType), {
      type: mimeType || 'audio/ogg',
    });
    const result = await client.audio.transcriptions.create({
      file,
      model: WHISPER_MODEL,
      response_format: 'text',
    });
    const text = (typeof result === 'string' ? result : '').trim();
    if (!text) {
      log.warn('Whisper returned empty transcript', { bytes: buffer.length });
      return null;
    }
    log.info('Voice transcription succeeded', {
      bytes: buffer.length,
      transcriptLength: text.length,
    });
    return text;
  } catch (err) {
    log.error('Whisper transcription failed', { err });
    return null;
  }
}
