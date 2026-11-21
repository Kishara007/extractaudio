import type { ExportPreset, Mp3Bitrate, OutputFormat } from './types';

/**
 * Formats seconds as MM:SS.d (or HH:MM:SS.d for >= 1 hour).
 */
export function formatTimeDisplay(seconds: number): string {
  const clamped = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const totalTenths = Math.round(clamped * 10);
  const tenths = totalTenths % 10;
  const totalWholeSeconds = Math.floor(totalTenths / 10);
  const secs = totalWholeSeconds % 60;
  const totalMinutes = Math.floor(totalWholeSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const secStr = String(secs).padStart(2, '0');
  if (hours > 0) {
    const minStr = String(mins).padStart(2, '0');
    return `${hours}:${minStr}:${secStr}.${tenths}`;
  }
  const minStr = String(totalMinutes).padStart(2, '0');
  return `${minStr}:${secStr}.${tenths}`;
}

/**
 * Parses MM:SS.d, MM:SS, HH:MM:SS.d, or raw seconds into a clamped number.
 */
export function parseTimeInput(raw: string, maxSeconds: number): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let totalSeconds: number;
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((part) => Number(part));
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
    if (parts.length === 2) {
      totalSeconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      return null;
    }
  } else {
    const num = Number(trimmed);
    if (!Number.isFinite(num) || num < 0) return null;
    totalSeconds = num;
  }

  return Math.max(0, Math.min(maxSeconds, totalSeconds));
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function parseExportPreset(preset: ExportPreset): { format: OutputFormat; bitrate: Mp3Bitrate } {
  switch (preset) {
    case 'mp3-320':
      return { format: 'mp3', bitrate: 320 };
    case 'mp3-192':
      return { format: 'mp3', bitrate: 192 };
    case 'mp3-128':
      return { format: 'mp3', bitrate: 128 };
    case 'wav':
      return { format: 'wav', bitrate: 320 };
  }
}

export function buildOutputFilename(originalFileName: string, format: OutputFormat): string {
  const dotIndex = originalFileName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? originalFileName.slice(0, dotIndex) : originalFileName;
  const sanitized = baseName.trim() || 'extracted-audio';
  return `${sanitized}.${format}`;
}

export function estimateOutputSizeBytes(durationSec: number, preset: ExportPreset, sampleRate = 44100, channels = 2): number {
  const safeDuration = Math.max(0, durationSec);
  if (preset === 'wav') {
    // 16-bit PCM = 2 bytes/sample * channels * sampleRate
    return Math.round(44 + safeDuration * sampleRate * Math.min(2, Math.max(1, channels)) * 2);
  }
  const { bitrate } = parseExportPreset(preset);
  return Math.round((safeDuration * bitrate * 1000) / 8);
}
