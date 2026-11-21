import { AudioExtractionError, type DecodedVideoAudio } from './types';
import { computeWaveformPeaks } from './waveform';

const SUPPORTED_EXTENSIONS = new Set([
  'mp4',
  'mov',
  'webm',
  'mkv',
  'avi',
  'ogg',
  'ogv',
  'm4v',
  '3gp',
  'flv',
  'wmv',
  'ts',
  'mts',
  'mpeg',
  'mpg',
  'mp3',
  'wav',
  'm4a',
  'aac',
]);

const FFMPEG_CORE_BASES = [
  'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm',
  'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm',
];

type FFmpegInstance = import('@ffmpeg/ffmpeg').FFmpeg;
let cachedFfmpegPromise: Promise<FFmpegInstance> | null = null;

function getAudioContextConstructor(): typeof AudioContext {
  const win = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) {
    throw new AudioExtractionError('DECODE_FAILED', 'Web Audio API is unavailable in this browser.');
  }
  return Ctor;
}

function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function isSupportedMediaFile(file: File): boolean {
  if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
    return true;
  }
  const ext = getFileExtension(file.name);
  return SUPPORTED_EXTENSIONS.has(ext);
}

async function getLazyFFmpeg(): Promise<FFmpegInstance> {
  if (cachedFfmpegPromise) {
    return cachedFfmpegPromise;
  }

  cachedFfmpegPromise = (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ]);

    const ffmpeg = new FFmpeg();
    let lastError: unknown = null;

    for (const baseURL of FFMPEG_CORE_BASES) {
      try {
        const [coreURL, wasmURL] = await Promise.all([
          toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        ]);
        await ffmpeg.load({ coreURL, wasmURL });
        return ffmpeg;
      } catch (err) {
        lastError = err;
      }
    }

    cachedFfmpegPromise = null;
    throw lastError ?? new Error('Failed to load FFmpeg WASM core.');
  })();

  return cachedFfmpegPromise;
}

/**
 * Parses a standard 16-bit PCM RIFF/WAVE buffer produced by FFmpeg directly into an AudioBuffer.
 */
function wavBytesToAudioBuffer(bytes: Uint8Array, audioContext: AudioContext): AudioBuffer {
  if (bytes.byteLength < 44) {
    throw new AudioExtractionError('NO_AUDIO_TRACK', 'Extracted WAV output is empty.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const wave = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new AudioExtractionError('DECODE_FAILED', 'Invalid WAV header from FFmpeg.');
  }

  let offset = 12;
  let numChannels = 2;
  let sampleRate = 44100;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const bodyStart = offset + 8;

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      numChannels = view.getUint16(bodyStart + 2, true);
      sampleRate = view.getUint32(bodyStart + 4, true);
      bitsPerSample = view.getUint16(bodyStart + 14, true);
    } else if (chunkId === 'data') {
      dataOffset = bodyStart;
      dataSize = Math.min(chunkSize, bytes.byteLength - bodyStart);
      break;
    }

    offset = bodyStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || dataSize <= 0 || bitsPerSample !== 16) {
    throw new AudioExtractionError('NO_AUDIO_TRACK', 'No valid PCM audio data found.');
  }

  const bytesPerFrame = numChannels * 2;
  const frameCount = Math.floor(dataSize / bytesPerFrame);
  if (frameCount <= 0) {
    throw new AudioExtractionError('NO_AUDIO_TRACK', 'Video appears to contain no audio samples.');
  }

  const audioBuffer = audioContext.createBuffer(numChannels, frameCount, sampleRate);
  const channelArrays: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelArrays.push(audioBuffer.getChannelData(c));
  }

  let readPos = dataOffset;
  for (let i = 0; i < frameCount; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = view.getInt16(readPos, true);
      channelArrays[c][i] = sample < 0 ? sample / 32768 : sample / 32767;
      readPos += 2;
    }
  }

  return audioBuffer;
}

async function decodeWithFFmpegFallback(
  file: File,
  audioContext: AudioContext,
  onStage?: (stage: 'loading-ffmpeg' | 'decoding-ffmpeg') => void
): Promise<AudioBuffer> {
  onStage?.('loading-ffmpeg');
  const ffmpeg = await getLazyFFmpeg();
  const { fetchFile } = await import('@ffmpeg/util');

  onStage?.('decoding-ffmpeg');
  const ext = getFileExtension(file.name) || 'bin';
  const inputName = `input_${Date.now()}.${ext}`;
  const outputName = `output_${Date.now()}.wav`;

  const logs: string[] = [];
  const logHandler = ({ message }: { message: string }) => {
    logs.push(message);
  };
  ffmpeg.on('log', logHandler);

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    const exitCode = await ffmpeg.exec([
      '-i',
      inputName,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '44100',
      '-ac',
      '2',
      outputName,
    ]);

    if (exitCode !== 0) {
      const joined = logs.join('\n');
      if (/does not contain any stream|Output file does not contain|Audio.*not found/i.test(joined)) {
        throw new AudioExtractionError('NO_AUDIO_TRACK');
      }
      throw new AudioExtractionError('DECODE_FAILED', `FFmpeg exited with code ${exitCode}`);
    }

    const outputData = await ffmpeg.readFile(outputName);
    if (!(outputData instanceof Uint8Array)) {
      throw new AudioExtractionError('DECODE_FAILED', 'Unexpected FFmpeg output format.');
    }

    return wavBytesToAudioBuffer(outputData, audioContext);
  } finally {
    ffmpeg.off('log', logHandler);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

export interface DecodeVideoOptions {
  onStage?: (stage: 'decoding-native' | 'loading-ffmpeg' | 'decoding-ffmpeg') => void;
}

/**
 * Decodes audio from any video file 100% inside the browser.
 * Primary path: native AudioContext.decodeAudioData() for instant MP4/MOV/WebM/OGG decoding.
 * Fallback path: lazy single-threaded @ffmpeg/ffmpeg WASM decoder for MKV/AVI/exotic codecs.
 */
export async function decodeVideoAudio(
  file: File,
  options: DecodeVideoOptions = {}
): Promise<DecodedVideoAudio> {
  if (!isSupportedMediaFile(file)) {
    throw new AudioExtractionError('UNSUPPORTED_FILE');
  }

  const AudioCtx = getAudioContextConstructor();
  const audioContext = new AudioCtx();
  const ext = getFileExtension(file.name);
  const preferFfmpegFirst = ext === 'mkv' || ext === 'avi' || ext === 'flv' || ext === 'wmv';

  try {
    let audioBuffer: AudioBuffer | null = null;
    let decoder: 'native' | 'ffmpeg' = 'native';

    if (!preferFfmpegFirst) {
      options.onStage?.('decoding-native');
      try {
        const arrayBuffer = await file.arrayBuffer();
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        decoder = 'native';
      } catch {
        // Native browser decoder cannot decode this container/codec; fall back lazily to single-threaded FFmpeg.
        audioBuffer = null;
      }
    }

    if (!audioBuffer) {
      try {
        audioBuffer = await decodeWithFFmpegFallback(file, audioContext, (stage) => {
          options.onStage?.(stage);
        });
        decoder = 'ffmpeg';
      } catch (fallbackErr) {
        // If user dropped an MKV that actually works natively (e.g. Chromium Matroska/Opus), try native decode before failing.
        if (preferFfmpegFirst) {
          try {
            options.onStage?.('decoding-native');
            const arrayBuffer = await file.arrayBuffer();
            audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            decoder = 'native';
          } catch {
            throw fallbackErr;
          }
        } else {
          throw fallbackErr;
        }
      }
    }

    if (!audioBuffer || audioBuffer.duration <= 0 || audioBuffer.length === 0) {
      throw new AudioExtractionError('NO_AUDIO_TRACK');
    }

    const peaks = computeWaveformPeaks(audioBuffer, 220);

    return {
      fileName: file.name,
      fileSize: file.size,
      duration: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: Math.min(2, audioBuffer.numberOfChannels),
      peaks,
      audioBuffer,
      decoder,
    };
  } catch (err) {
    if (err instanceof AudioExtractionError) {
      throw err;
    }
    throw new AudioExtractionError('DECODE_FAILED', err instanceof Error ? err.message : undefined);
  } finally {
    await audioContext.close().catch(() => {});
  }
}
