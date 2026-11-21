import { Mp3Encoder } from '@breezystack/lamejs';
import type { WorkerEncodeMessage, WorkerEncodeRequest } from '../lib/audio/types';

interface WorkerScopeLike {
  onmessage: ((event: MessageEvent<WorkerEncodeRequest>) => void) | null;
  postMessage(message: WorkerEncodeMessage, transfer?: Transferable[]): void;
}

const workerSelf = self as unknown as WorkerScopeLike;

function floatToInt16Chunk(input: Float32Array, start: number, count: number, target: Int16Array): void {
  for (let i = 0; i < count; i++) {
    const sample = input[start + i];
    const clamped = sample < -1 ? -1 : sample > 1 ? 1 : sample;
    target[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
}

function encodeMp3(req: WorkerEncodeRequest): ArrayBuffer {
  const left = new Float32Array(req.channelBuffers[0]);
  const right = req.channelBuffers[1] ? new Float32Array(req.channelBuffers[1]) : null;
  const numChannels = right ? 2 : 1;
  const totalSamples = left.length;

  const encoder = new Mp3Encoder(numChannels, req.sampleRate, req.bitrate);
  const blockSize = 1152;
  const leftChunk = new Int16Array(blockSize);
  const rightChunk = right ? new Int16Array(blockSize) : null;
  const mp3Chunks: Uint8Array[] = [];

  let lastReportedPercent = -1;
  for (let offset = 0; offset < totalSamples; offset += blockSize) {
    const count = Math.min(blockSize, totalSamples - offset);
    const lBuf = count === blockSize ? leftChunk : leftChunk.subarray(0, count);
    floatToInt16Chunk(left, offset, count, lBuf);

    let encoded: Uint8Array;
    if (right && rightChunk) {
      const rBuf = count === blockSize ? rightChunk : rightChunk.subarray(0, count);
      floatToInt16Chunk(right, offset, count, rBuf);
      encoded = encoder.encodeBuffer(lBuf, rBuf);
    } else {
      encoded = encoder.encodeBuffer(lBuf);
    }

    if (encoded.length > 0) {
      mp3Chunks.push(new Uint8Array(encoded));
    }

    const percent = Math.min(98, Math.round(((offset + count) / totalSamples) * 98));
    if (percent >= lastReportedPercent + 2) {
      lastReportedPercent = percent;
      const progressMsg: WorkerEncodeMessage = { id: req.id, type: 'progress', percent };
      workerSelf.postMessage(progressMsg);
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    mp3Chunks.push(new Uint8Array(flushed));
  }

  let totalBytes = 0;
  for (const chunk of mp3Chunks) {
    totalBytes += chunk.byteLength;
  }

  const output = new Uint8Array(totalBytes);
  let writeOffset = 0;
  for (const chunk of mp3Chunks) {
    output.set(chunk, writeOffset);
    writeOffset += chunk.byteLength;
  }

  return output.buffer;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function encodeWav(req: WorkerEncodeRequest): ArrayBuffer {
  const left = new Float32Array(req.channelBuffers[0]);
  const right = req.channelBuffers[1] ? new Float32Array(req.channelBuffers[1]) : null;
  const numChannels = right ? 2 : 1;
  const totalSamples = left.length;
  const bytesPerSample = 2;
  const dataByteLength = totalSamples * numChannels * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk length
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, req.sampleRate, true);
  view.setUint32(28, req.sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true); // 16-bit PCM
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataByteLength, true);

  let writeOffset = 44;
  let lastReportedPercent = -1;
  const progressStep = Math.max(4096, Math.floor(totalSamples / 50));

  for (let i = 0; i < totalSamples; i++) {
    const lSample = left[i];
    const lClamped = lSample < -1 ? -1 : lSample > 1 ? 1 : lSample;
    view.setInt16(writeOffset, lClamped < 0 ? lClamped * 0x8000 : lClamped * 0x7fff, true);
    writeOffset += 2;

    if (right) {
      const rSample = right[i];
      const rClamped = rSample < -1 ? -1 : rSample > 1 ? 1 : rSample;
      view.setInt16(writeOffset, rClamped < 0 ? rClamped * 0x8000 : rClamped * 0x7fff, true);
      writeOffset += 2;
    }

    if (i > 0 && (i % progressStep === 0 || i === totalSamples - 1)) {
      const percent = Math.min(99, Math.round(((i + 1) / totalSamples) * 100));
      if (percent >= lastReportedPercent + 2) {
        lastReportedPercent = percent;
        const progressMsg: WorkerEncodeMessage = { id: req.id, type: 'progress', percent };
        workerSelf.postMessage(progressMsg);
      }
    }
  }

  return buffer;
}

workerSelf.onmessage = (event: MessageEvent<WorkerEncodeRequest>) => {
  const req = event.data;
  try {
    const outputBuffer = req.format === 'mp3' ? encodeMp3(req) : encodeWav(req);
    const mimeType = req.format === 'mp3' ? 'audio/mpeg' : 'audio/wav';

    const completeMsg: WorkerEncodeMessage = {
      id: req.id,
      type: 'complete',
      buffer: outputBuffer,
      mimeType,
    };
    workerSelf.postMessage(completeMsg, [outputBuffer]);
  } catch (err) {
    const errorMsg: WorkerEncodeMessage = {
      id: req.id,
      type: 'error',
      message: err instanceof Error ? err.message : 'Audio encoding failed.',
    };
    workerSelf.postMessage(errorMsg);
  }
};
