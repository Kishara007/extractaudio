export type OutputFormat = 'mp3' | 'wav';

export type Mp3Bitrate = 128 | 192 | 320;

export type ExportPreset = 'mp3-320' | 'mp3-192' | 'mp3-128' | 'wav';

export type DecoderBackend = 'native' | 'ffmpeg';

export type ExtractionStage = 'idle' | 'decoding-native' | 'loading-ffmpeg' | 'decoding-ffmpeg' | 'rendering' | 'encoding' | 'ready' | 'error';

export type AudioErrorCode =
  | 'UNSUPPORTED_FILE'
  | 'NO_AUDIO_TRACK'
  | 'DECODE_FAILED'
  | 'ENCODE_FAILED'
  | 'FILE_TOO_LARGE';

export class AudioExtractionError extends Error {
  public readonly code: AudioErrorCode;

  constructor(code: AudioErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AudioExtractionError';
    this.code = code;
  }
}

export interface DecodedVideoAudio {
  fileName: string;
  fileSize: number;
  duration: number;
  sampleRate: number;
  channels: number;
  peaks: Float32Array;
  audioBuffer: AudioBuffer;
  decoder: DecoderBackend;
}

export interface TrimOptions {
  startSec: number;
  endSec: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface WorkerEncodeRequest {
  id: string;
  format: OutputFormat;
  bitrate: Mp3Bitrate;
  sampleRate: number;
  channelBuffers: ArrayBuffer[];
}

export type WorkerEncodeMessage =
  | {
      id: string;
      type: 'progress';
      percent: number;
    }
  | {
      id: string;
      type: 'complete';
      buffer: ArrayBuffer;
      mimeType: 'audio/mpeg' | 'audio/wav';
    }
  | {
      id: string;
      type: 'error';
      message: string;
    };
