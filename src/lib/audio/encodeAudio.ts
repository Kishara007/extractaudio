import { AudioExtractionError, type Mp3Bitrate, type OutputFormat, type WorkerEncodeMessage, type WorkerEncodeRequest } from './types';

export interface EncodeAudioParams {
  format: OutputFormat;
  bitrate: Mp3Bitrate;
  sampleRate: number;
  channels: Float32Array[];
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/**
 * Encodes Float32 PCM channels into MP3 (lamejs) or 16-bit PCM WAV inside a dedicated Web Worker.
 */
export function encodeAudioInWorker(params: EncodeAudioParams): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (params.signal?.aborted) {
      reject(new DOMException('Encoding cancelled', 'AbortError'));
      return;
    }

    const worker = new Worker(new URL('../../workers/mp3Encode.worker.ts', import.meta.url), {
      type: 'module',
    });

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const channelBuffers = params.channels.map((ch) => ch.buffer as ArrayBuffer);

    const cleanup = () => {
      params.signal?.removeEventListener('abort', onAbort);
      worker.terminate();
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Encoding cancelled', 'AbortError'));
    };

    params.signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (event: MessageEvent<WorkerEncodeMessage>) => {
      const msg = event.data;
      if (msg.id !== jobId) return;

      if (msg.type === 'progress') {
        params.onProgress?.(msg.percent);
      } else if (msg.type === 'complete') {
        params.onProgress?.(100);
        cleanup();
        resolve(new Blob([msg.buffer], { type: msg.mimeType }));
      } else if (msg.type === 'error') {
        cleanup();
        reject(new AudioExtractionError('ENCODE_FAILED', msg.message));
      }
    };

    worker.onerror = (err) => {
      cleanup();
      reject(new AudioExtractionError('ENCODE_FAILED', err.message || 'Worker error'));
    };

    const request: WorkerEncodeRequest = {
      id: jobId,
      format: params.format,
      bitrate: params.bitrate,
      sampleRate: params.sampleRate,
      channelBuffers,
    };

    worker.postMessage(request, channelBuffers);
  });
}
