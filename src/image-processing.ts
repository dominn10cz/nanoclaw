/**
 * Image processing for inbound multimodal messages.
 *
 * Channel-agnostic — called from chat-sdk-bridge.messageToInbound for any
 * attachment whose `type === 'image'`. Resizes and re-encodes large incoming
 * images so the agent's context window pays a predictable token cost
 * regardless of source resolution, and so the inbound DB row doesn't carry
 * 5+ MB of base64.
 *
 * Sizing target: 1568 px on the long edge. Anthropic's vision pipeline scales
 * larger inputs down to ~1568 internally before tokenizing, so anything bigger
 * is wasted DB space and bandwidth. JPEG q85 — standard quality for
 * photographs, ~10× smaller than PNG for typical Telegram phone shots.
 *
 * Failures return null. Caller decides the fallback (typically: keep the
 * original `entry.data` so the agent at least sees that something was
 * attached).
 */
import sharp from 'sharp';

import { log } from './log.js';

const TARGET_LONG_EDGE = 1568;
const JPEG_QUALITY = 85;

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

export async function processImage(buffer: Buffer, mimeType: string | undefined): Promise<ProcessedImage | null> {
  if (buffer.length === 0) {
    log.warn('processImage called with empty buffer');
    return null;
  }

  try {
    const pipeline = sharp(buffer, { failOn: 'error' });
    const metadata = await pipeline.metadata();
    const srcWidth = metadata.width ?? 0;
    const srcHeight = metadata.height ?? 0;

    // Skip resize if the image is already small enough — no point re-encoding
    // a thumbnail through JPEG and adding artifacts.
    const needsResize = srcWidth > TARGET_LONG_EDGE || srcHeight > TARGET_LONG_EDGE;
    const work = needsResize
      ? pipeline.resize({
          width: TARGET_LONG_EDGE,
          height: TARGET_LONG_EDGE,
          fit: 'inside',
          withoutEnlargement: true,
        })
      : pipeline;

    const out = await work.jpeg({ quality: JPEG_QUALITY, mozjpeg: false }).toBuffer({ resolveWithObject: true });

    log.info('Image processed', {
      sourceMime: mimeType,
      sourceBytes: buffer.length,
      sourceDims: srcWidth && srcHeight ? `${srcWidth}x${srcHeight}` : 'unknown',
      outputBytes: out.info.size,
      outputDims: `${out.info.width}x${out.info.height}`,
    });

    return {
      buffer: out.data,
      mimeType: 'image/jpeg',
      width: out.info.width,
      height: out.info.height,
    };
  } catch (err) {
    log.warn('Image processing failed', { err, sourceMime: mimeType });
    return null;
  }
}
