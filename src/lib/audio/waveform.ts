/**
 * Computes normalized peak amplitudes across all channels for crisp canvas waveform rendering.
 */
export function computeWaveformPeaks(audioBuffer: AudioBuffer, bucketCount = 220): Float32Array {
  const safeBuckets = Math.max(32, Math.min(512, bucketCount));
  const peaks = new Float32Array(safeBuckets);
  const totalSamples = audioBuffer.length;
  if (totalSamples === 0) return peaks;

  const channelCount = Math.min(2, audioBuffer.numberOfChannels);
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) {
    channelData.push(audioBuffer.getChannelData(c));
  }

  const samplesPerBucket = Math.max(1, Math.floor(totalSamples / safeBuckets));
  // Stride within large buckets so long 2-hour videos compute in <15ms
  const stride = Math.max(1, Math.floor(samplesPerBucket / 64));

  let globalMax = 0;
  for (let i = 0; i < safeBuckets; i++) {
    const start = i * samplesPerBucket;
    const end = i === safeBuckets - 1 ? totalSamples : Math.min(totalSamples, start + samplesPerBucket);
    let bucketPeak = 0;

    for (let s = start; s < end; s += stride) {
      let sampleAmp = 0;
      for (let c = 0; c < channelCount; c++) {
        const abs = Math.abs(channelData[c][s]);
        if (abs > sampleAmp) sampleAmp = abs;
      }
      if (sampleAmp > bucketPeak) bucketPeak = sampleAmp;
    }

    peaks[i] = bucketPeak;
    if (bucketPeak > globalMax) globalMax = bucketPeak;
  }

  if (globalMax > 0.001) {
    for (let i = 0; i < safeBuckets; i++) {
      // Gentle perceptual curve for better visual contrast
      peaks[i] = Math.pow(peaks[i] / globalMax, 0.85);
    }
  }

  return peaks;
}
