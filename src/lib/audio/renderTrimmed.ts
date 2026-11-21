import type { TrimOptions } from './types';

export interface RenderedPcm {
  channels: Float32Array[];
  sampleRate: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Direct Float32Array slicing & fade envelope fallback when OfflineAudioContext fails on constrained devices.
 */
function renderTrimmedDirect(
  audioBuffer: AudioBuffer,
  startSec: number,
  endSec: number,
  fadeInSec: number,
  fadeOutSec: number
): RenderedPcm {
  const sampleRate = audioBuffer.sampleRate;
  const channelCount = Math.min(2, audioBuffer.numberOfChannels);
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(audioBuffer.length, Math.max(startSample + 1, Math.floor(endSec * sampleRate)));
  const length = endSample - startSample;

  const fadeInSamples = Math.min(Math.floor(length / 2), Math.floor(fadeInSec * sampleRate));
  const fadeOutSamples = Math.min(Math.floor(length / 2), Math.floor(fadeOutSec * sampleRate));

  const channels: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) {
    const slice = new Float32Array(audioBuffer.getChannelData(c).subarray(startSample, endSample));
    for (let i = 0; i < fadeInSamples; i++) {
      slice[i] *= i / fadeInSamples;
    }
    for (let i = 0; i < fadeOutSamples; i++) {
      const idx = length - 1 - i;
      slice[idx] *= i / fadeOutSamples;
    }
    channels.push(slice);
  }

  return { channels, sampleRate };
}

/**
 * Renders trimmed audio with optional fade-in and fade-out via OfflineAudioContext.
 */
export async function renderTrimmedAudio(
  audioBuffer: AudioBuffer,
  options: TrimOptions
): Promise<RenderedPcm> {
  const totalDuration = audioBuffer.duration;
  const startSec = clamp(options.startSec, 0, Math.max(0, totalDuration - 0.05));
  const endSec = clamp(options.endSec, startSec + 0.05, totalDuration);
  const trimDuration = Math.max(0.05, endSec - startSec);

  const maxFade = trimDuration / 2;
  const fadeInSec = clamp(options.fadeInSec, 0, maxFade);
  const fadeOutSec = clamp(options.fadeOutSec, 0, maxFade);

  const sampleRate = clamp(audioBuffer.sampleRate, 8000, 96000);
  const channelCount = Math.min(2, Math.max(1, audioBuffer.numberOfChannels));
  const frameCount = Math.max(1, Math.round(trimDuration * sampleRate));

  const OfflineCtx = window.OfflineAudioContext;
  if (!OfflineCtx) {
    return renderTrimmedDirect(audioBuffer, startSec, endSec, fadeInSec, fadeOutSec);
  }

  try {
    const offlineCtx = new OfflineCtx(channelCount, frameCount, sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = offlineCtx.createGain();
    if (fadeInSec > 0.005) {
      gainNode.gain.setValueAtTime(0, 0);
      gainNode.gain.linearRampToValueAtTime(1, fadeInSec);
    } else {
      gainNode.gain.setValueAtTime(1, 0);
    }

    if (fadeOutSec > 0.005) {
      const fadeOutStart = Math.max(fadeInSec, trimDuration - fadeOutSec);
      gainNode.gain.setValueAtTime(1, fadeOutStart);
      gainNode.gain.linearRampToValueAtTime(0, trimDuration);
    }

    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);
    source.start(0, startSec, trimDuration);

    const renderedBuffer = await offlineCtx.startRendering();
    const channels: Float32Array[] = [];
    for (let c = 0; c < channelCount; c++) {
      // Copy into fresh Float32Array so its ArrayBuffer is safe to transfer to the Web Worker
      channels.push(new Float32Array(renderedBuffer.getChannelData(c)));
    }
    return {
      channels,
      sampleRate: renderedBuffer.sampleRate,
    };
  } catch {
    return renderTrimmedDirect(audioBuffer, startSec, endSec, fadeInSec, fadeOutSec);
  }
}
