import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileAudio,
  Lock,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { decodeVideoAudio } from '../lib/audio/decodeVideo';
import { encodeAudioInWorker } from '../lib/audio/encodeAudio';
import { renderTrimmedAudio } from '../lib/audio/renderTrimmed';
import {
  buildOutputFilename,
  estimateOutputSizeBytes,
  formatFileSize,
  formatTimeDisplay,
  parseExportPreset,
  parseTimeInput,
} from '../lib/audio/timeFormat';
import {
  AudioExtractionError,
  type AudioErrorCode,
  type DecodedVideoAudio,
  type ExportPreset,
  type ExtractionStage,
} from '../lib/audio/types';
import WaveformEditor from './WaveformEditor';

type FadeOption = 0 | 0.5 | 1.5;

export default function VideoToMp3Tool() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Audio preview playback refs
  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewStartTimeRef = useRef<number>(0);
  const previewOffsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [stage, setStage] = useState<ExtractionStage>('idle');
  const [encodePercent, setEncodePercent] = useState(0);
  const [errorCode, setErrorCode] = useState<AudioErrorCode | null>(null);
  const [decoded, setDecoded] = useState<DecodedVideoAudio | null>(null);

  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [startInput, setStartInput] = useState('00:00.0');
  const [endInput, setEndInput] = useState('00:00.0');
  const [fadeSec, setFadeSec] = useState<FadeOption>(0);
  const [preset, setPreset] = useState<ExportPreset>('mp3-320');

  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('');

  const revokeDownloadUrl = useCallback(() => {
    setDownloadUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const stopPreview = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.onended = null;
        previewSourceRef.current.stop();
        previewSourceRef.current.disconnect();
      } catch {
        // Ignore already-stopped nodes.
      }
      previewSourceRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      stopPreview();
      abortControllerRef.current?.abort();
      if (previewCtxRef.current) {
        previewCtxRef.current.close().catch(() => {});
        previewCtxRef.current = null;
      }
      setDownloadUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [stopPreview]);

  const syncTrimState = useCallback(
    (nextStart: number, nextEnd: number) => {
      setStartSec(nextStart);
      setEndSec(nextEnd);
      setStartInput(formatTimeDisplay(nextStart));
      setEndInput(formatTimeDisplay(nextEnd));
      setPlayheadSec((prev) => (prev < nextStart || prev > nextEnd ? nextStart : prev));
      revokeDownloadUrl();
    },
    [revokeDownloadUrl]
  );

  const handleSelectedFile = useCallback(
    async (file: File) => {
      stopPreview();
      abortControllerRef.current?.abort();
      revokeDownloadUrl();
      setErrorCode(null);
      setDecoded(null);
      setEncodePercent(0);
      setStage('decoding-native');

      try {
        const result = await decodeVideoAudio(file, {
          onStage: (nextStage) => setStage(nextStage),
        });
        setDecoded(result);
        setStartSec(0);
        setEndSec(result.duration);
        setStartInput(formatTimeDisplay(0));
        setEndInput(formatTimeDisplay(result.duration));
        setPlayheadSec(0);
        setStage('ready');
      } catch (err) {
        if (err instanceof AudioExtractionError) {
          setErrorCode(err.code);
        } else {
          setErrorCode('DECODE_FAILED');
        }
        setStage('error');
      }
    },
    [revokeDownloadUrl, stopPreview]
  );

  const startPreviewAt = useCallback(
    async (fromSec: number) => {
      if (!decoded) return;
      stopPreview();

      const clampedStart = Math.max(startSec, Math.min(endSec - 0.05, fromSec));
      const remainingDuration = Math.max(0.05, endSec - clampedStart);

      const AudioCtx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!previewCtxRef.current || previewCtxRef.current.state === 'closed') {
        previewCtxRef.current = new AudioCtx();
      }
      const ctx = previewCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createBufferSource();
      source.buffer = decoded.audioBuffer;
      source.connect(ctx.destination);

      previewSourceRef.current = source;
      previewStartTimeRef.current = ctx.currentTime;
      previewOffsetRef.current = clampedStart;
      setPlayheadSec(clampedStart);
      setIsPlaying(true);

      source.onended = () => {
        if (previewSourceRef.current === source) {
          stopPreview();
          setPlayheadSec(startSec);
        }
      };

      source.start(0, clampedStart, remainingDuration);

      const tick = () => {
        if (!previewCtxRef.current || !previewSourceRef.current) return;
        const elapsed = previewCtxRef.current.currentTime - previewStartTimeRef.current;
        const current = Math.min(endSec, previewOffsetRef.current + elapsed);
        setPlayheadSec(current);
        if (current < endSec) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [decoded, endSec, startSec, stopPreview]
  );

  const togglePlay = () => {
    if (isPlaying) {
      stopPreview();
      return;
    }
    const resumeAt = playheadSec >= startSec && playheadSec < endSec - 0.1 ? playheadSec : startSec;
    void startPreviewAt(resumeAt);
  };

  const handleSeek = (sec: number) => {
    setPlayheadSec(sec);
    if (isPlaying) {
      void startPreviewAt(sec);
    }
  };

  const commitStartInput = () => {
    if (!decoded) return;
    const parsed = parseTimeInput(startInput, decoded.duration);
    if (parsed === null) {
      setStartInput(formatTimeDisplay(startSec));
      return;
    }
    const clamped = Math.max(0, Math.min(endSec - 0.25, parsed));
    syncTrimState(clamped, endSec);
  };

  const commitEndInput = () => {
    if (!decoded) return;
    const parsed = parseTimeInput(endInput, decoded.duration);
    if (parsed === null) {
      setEndInput(formatTimeDisplay(endSec));
      return;
    }
    const clamped = Math.min(decoded.duration, Math.max(startSec + 0.25, parsed));
    syncTrimState(startSec, clamped);
  };

  const triggerBlobDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleConvert = async () => {
    if (!decoded) return;
    stopPreview();
    revokeDownloadUrl();
    setErrorCode(null);
    setEncodePercent(0);
    setStage('rendering');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const rendered = await renderTrimmedAudio(decoded.audioBuffer, {
        startSec,
        endSec,
        fadeInSec: fadeSec,
        fadeOutSec: fadeSec,
      });

      if (controller.signal.aborted) return;

      const { format, bitrate } = parseExportPreset(preset);
      setStage('encoding');

      const blob = await encodeAudioInWorker({
        format,
        bitrate,
        sampleRate: rendered.sampleRate,
        channels: rendered.channels,
        onProgress: (pct) => setEncodePercent(pct),
        signal: controller.signal,
      });

      const outName = buildOutputFilename(decoded.fileName, format);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);
      setDownloadName(outName);
      setStage('ready');
      triggerBlobDownload(url, outName);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStage('ready');
        setEncodePercent(0);
        return;
      }
      setErrorCode('ENCODE_FAILED');
      setStage('ready');
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleCancelEncode = () => {
    abortControllerRef.current?.abort();
  };

  const handleResetAll = () => {
    stopPreview();
    abortControllerRef.current?.abort();
    revokeDownloadUrl();
    setDecoded(null);
    setErrorCode(null);
    setEncodePercent(0);
    setStage('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const errorMessage = (code: AudioErrorCode | null): string | null => {
    if (!code) return null;
    switch (code) {
      case 'UNSUPPORTED_FILE':
        return t.tool.errUnsupported;
      case 'NO_AUDIO_TRACK':
        return t.tool.errNoAudio;
      case 'ENCODE_FAILED':
        return t.tool.errEncode;
      default:
        return t.tool.errDecode;
    }
  };

  const isBusyDecoding =
    stage === 'decoding-native' || stage === 'loading-ffmpeg' || stage === 'decoding-ffmpeg';
  const isBusyEncoding = stage === 'rendering' || stage === 'encoding';

  const decodingStatusText =
    stage === 'loading-ffmpeg'
      ? t.tool.loadingFfmpeg
      : stage === 'decoding-ffmpeg'
      ? t.tool.decodingFfmpeg
      : t.tool.decodingNative;

  const selectedDuration = decoded ? Math.max(0, endSec - startSec) : 0;
  const isTrimmed = decoded ? startSec > 0.05 || endSec < decoded.duration - 0.05 : false;
  const estBytes = decoded
    ? estimateOutputSizeBytes(selectedDuration, preset, decoded.sampleRate, decoded.channels)
    : 0;

  return (
    <section
      aria-label={t.nav.brandTitle}
      className="w-full max-w-3xl mx-auto focal-card rounded-3xl p-5 sm:p-8"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,audio/*,.mp4,.mov,.webm,.mkv,.avi,.ogg,.ogv,.m4v,.3gp,.flv,.wmv"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleSelectedFile(file);
        }}
      />

      {/* Error Alert Banner */}
      {errorCode && (
        <div
          role="alert"
          className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3.5 text-sm text-[#27374D] dark:text-[#DDE6ED] animate-fade-slide"
        >
          <p className="font-medium leading-snug">{errorMessage(errorCode)}</p>
          <button
            type="button"
            onClick={() => setErrorCode(null)}
            aria-label={t.tool.cancelButton}
            className="shrink-0 rounded-lg p-1 hover:bg-red-500/15 transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 1. EMPTY / DROPZONE STATE */}
      {!decoded && !isBusyDecoding && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleSelectedFile(file);
          }}
          className={`relative rounded-2xl border-2 border-dashed transition-all duration-200 p-6 sm:p-10 text-center ${
            isDragging
              ? 'border-[#526D82] dark:border-[#9DB2BF] bg-[#DDE6ED]/65 dark:bg-[#27374D]/70 dropzone-drag-active scale-[1.005]'
              : 'border-[#9DB2BF] dark:border-[#526D82] bg-[#DDE6ED]/35 dark:bg-[#16202E]/65 hover:border-[#526D82] dark:hover:border-[#9DB2BF]'
          }`}
        >
          {/* Privacy Lock Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-[#FFFFFF] dark:bg-[#1E2B3C] border border-[#9DB2BF]/45 dark:border-[#526D82]/50 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-[#526D82] dark:text-[#9DB2BF] shadow-xs mb-5">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t.tool.privacyBadge}</span>
          </div>

          {/* Animated Audio-Wave Emblem */}
          <div
            aria-hidden="true"
            className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-[#27374D] dark:bg-[#27374D] text-[#DDE6ED] shadow-lg border border-[#526D82]/40"
          >
            <div className="flex items-end gap-1.5 h-9">
              <span className="w-1.5 h-5 rounded-full bg-[#9DB2BF] wave-bar wave-bar-1" />
              <span className="w-1.5 h-8 rounded-full bg-[#DDE6ED] wave-bar wave-bar-2" />
              <span className="w-1.5 h-9 rounded-full bg-[#9DB2BF] wave-bar wave-bar-3" />
              <span className="w-1.5 h-7 rounded-full bg-[#DDE6ED] wave-bar wave-bar-4" />
              <span className="w-1.5 h-4 rounded-full bg-[#9DB2BF] wave-bar wave-bar-5" />
            </div>
          </div>

          {/* Main Dropzone Action Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-3 min-h-[56px] px-7 py-3.5 rounded-2xl bg-[#526D82] hover:bg-[#27374D] text-white dark:bg-[#9DB2BF] dark:text-[#16202E] dark:hover:bg-[#DDE6ED] text-base sm:text-lg font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82]"
          >
            <Upload className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            <span>{t.tool.dropTitle}</span>
          </button>

          <p className="mt-3 text-sm sm:text-base font-medium text-[#526D82] dark:text-[#9DB2BF]">
            {t.tool.dropSubtitle}
          </p>

          <p className="mt-4 text-xs sm:text-sm font-semibold tracking-wide text-[#526D82]/90 dark:text-[#9DB2BF]/90">
            {t.tool.supportedFormats}
          </p>
        </div>
      )}

      {/* 2. DECODING IN PROGRESS STATE */}
      {isBusyDecoding && (
        <div className="rounded-2xl border border-[#9DB2BF]/40 dark:border-[#526D82]/50 bg-[#DDE6ED]/35 dark:bg-[#16202E]/70 p-8 sm:p-12 text-center animate-fade-slide">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#27374D] text-[#DDE6ED]">
            <div className="flex items-end gap-1 h-7">
              <span className="w-1.5 h-4 rounded-full bg-[#9DB2BF] wave-bar wave-bar-1" />
              <span className="w-1.5 h-7 rounded-full bg-[#DDE6ED] wave-bar wave-bar-2" />
              <span className="w-1.5 h-5 rounded-full bg-[#9DB2BF] wave-bar wave-bar-3" />
              <span className="w-1.5 h-7 rounded-full bg-[#DDE6ED] wave-bar wave-bar-4" />
            </div>
          </div>
          <p className="text-base sm:text-lg font-bold text-[#27374D] dark:text-[#DDE6ED]">
            {decodingStatusText}
          </p>
          <div className="mt-5 mx-auto max-w-md h-2.5 w-full rounded-full bg-[#9DB2BF]/30 dark:bg-[#27374D] overflow-hidden">
            <div className="h-full w-full progress-sheen rounded-full" />
          </div>
        </div>
      )}

      {/* 3. LOADED WORKSPACE STATE */}
      {decoded && !isBusyDecoding && (
        <div className="space-y-5 animate-fade-slide">
          {/* File Summary Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#9DB2BF]/30 dark:border-[#526D82]/40">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#27374D] text-[#DDE6ED] dark:bg-[#16202E] dark:text-[#9DB2BF]">
                <FileAudio className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p
                  className="text-base sm:text-lg font-bold text-[#27374D] dark:text-[#DDE6ED] truncate"
                  title={decoded.fileName}
                >
                  {decoded.fileName}
                </p>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-[#526D82] dark:text-[#9DB2BF] mt-0.5">
                  <span>{formatFileSize(decoded.fileSize)}</span>
                  <span aria-hidden="true">•</span>
                  <span>
                    {t.tool.durationLabel}: {formatTimeDisplay(decoded.duration)}
                  </span>
                  <span aria-hidden="true">•</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-[#DDE6ED] dark:bg-[#27374D] px-2 py-0.5 text-[11px] font-semibold text-[#27374D] dark:text-[#DDE6ED]">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    {decoded.decoder === 'ffmpeg' ? t.tool.decoderFfmpegBadge : t.tool.decoderNativeBadge}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetAll}
              disabled={isBusyEncoding}
              className="inline-flex shrink-0 items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-[#9DB2BF]/50 dark:border-[#526D82]/60 text-sm font-semibold text-[#27374D] dark:text-[#DDE6ED] hover:bg-[#DDE6ED]/70 dark:hover:bg-[#27374D] disabled:opacity-50 transition-colors"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>{t.tool.changeFile}</span>
            </button>
          </div>

          {/* Interactive Waveform Stage */}
          <WaveformEditor
            peaks={decoded.peaks}
            duration={decoded.duration}
            startSec={startSec}
            endSec={endSec}
            playheadSec={playheadSec}
            isPlaying={isPlaying}
            waveformAriaLabel={t.tool.waveformAria}
            trimStartAriaLabel={t.tool.trimStartAria}
            trimEndAriaLabel={t.tool.trimEndAria}
            onChangeRange={syncTrimState}
            onSeek={handleSeek}
          />

          {/* Trim, Preview & Fade Row */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Play/Pause Preview + Selected Length */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={togglePlay}
                disabled={isBusyEncoding}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#27374D] hover:bg-[#526D82] text-white dark:bg-[#16202E] dark:hover:bg-[#526D82] dark:text-[#DDE6ED] border border-[#526D82]/40 text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-4 w-4" aria-hidden="true" />
                    <span>{t.tool.pausePreview}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    <span>{t.tool.playPreview}</span>
                  </>
                )}
              </button>

              <div className="text-xs sm:text-sm font-semibold text-[#526D82] dark:text-[#9DB2BF] whitespace-nowrap">
                <span>{t.tool.selectedLength}: </span>
                <span className="text-[#27374D] dark:text-[#DDE6ED] tabular-nums">
                  {formatTimeDisplay(selectedDuration)}
                </span>
              </div>
            </div>

            {/* Numeric Start / End Inputs */}
            <div className="flex items-center gap-2 flex-1 min-w-[230px] max-w-sm">
              <label className="flex-1 flex items-center gap-1.5 rounded-xl bg-[#DDE6ED]/50 dark:bg-[#16202E] border border-[#9DB2BF]/40 dark:border-[#526D82]/50 px-3 py-1.5 min-h-[44px]">
                <Scissors className="h-3.5 w-3.5 shrink-0 text-[#526D82] dark:text-[#9DB2BF]" aria-hidden="true" />
                <span className="text-xs font-semibold text-[#526D82] dark:text-[#9DB2BF] shrink-0">
                  {t.tool.trimStart}
                </span>
                <input
                  type="text"
                  value={startInput}
                  disabled={isBusyEncoding}
                  onChange={(e) => setStartInput(e.target.value)}
                  onBlur={commitStartInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitStartInput();
                  }}
                  aria-label={t.tool.trimStartAria}
                  className="w-full min-w-[54px] bg-transparent text-right text-sm font-bold tabular-nums text-[#27374D] dark:text-[#DDE6ED] focus:outline-none"
                />
              </label>

              <label className="flex-1 flex items-center gap-1.5 rounded-xl bg-[#DDE6ED]/50 dark:bg-[#16202E] border border-[#9DB2BF]/40 dark:border-[#526D82]/50 px-3 py-1.5 min-h-[44px]">
                <span className="text-xs font-semibold text-[#526D82] dark:text-[#9DB2BF] shrink-0">
                  {t.tool.trimEnd}
                </span>
                <input
                  type="text"
                  value={endInput}
                  disabled={isBusyEncoding}
                  onChange={(e) => setEndInput(e.target.value)}
                  onBlur={commitEndInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEndInput();
                  }}
                  aria-label={t.tool.trimEndAria}
                  className="w-full min-w-[54px] bg-transparent text-right text-sm font-bold tabular-nums text-[#27374D] dark:text-[#DDE6ED] focus:outline-none"
                />
              </label>

              {isTrimmed && (
                <button
                  type="button"
                  onClick={() => syncTrimState(0, decoded.duration)}
                  disabled={isBusyEncoding}
                  aria-label={t.tool.resetTrim}
                  title={t.tool.resetTrim}
                  className="inline-flex shrink-0 items-center justify-center min-w-[44px] min-h-[44px] rounded-xl border border-[#9DB2BF]/45 dark:border-[#526D82]/50 text-[#526D82] dark:text-[#9DB2BF] hover:text-[#27374D] dark:hover:text-[#DDE6ED] hover:bg-[#DDE6ED]/60 dark:hover:bg-[#27374D] transition-colors"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Smooth Fade Toggle */}
            <div className="flex shrink-0">
              <label className="flex items-center gap-2 rounded-xl bg-[#DDE6ED]/50 dark:bg-[#16202E] border border-[#9DB2BF]/40 dark:border-[#526D82]/50 px-3 min-h-[44px]">
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-[#526D82] dark:text-[#9DB2BF]" aria-hidden="true" />
                <span className="text-xs font-semibold text-[#526D82] dark:text-[#9DB2BF] whitespace-nowrap">
                  {t.tool.fadeLabel}:
                </span>
                <select
                  value={String(fadeSec)}
                  disabled={isBusyEncoding}
                  onChange={(e) => {
                    const val = Number(e.target.value) as FadeOption;
                    setFadeSec(val);
                    revokeDownloadUrl();
                  }}
                  aria-label={t.tool.fadeLabel}
                  className="bg-transparent text-xs sm:text-sm font-bold text-[#27374D] dark:text-[#DDE6ED] focus:outline-none pr-1"
                >
                  <option value="0">{t.tool.fadeNone}</option>
                  <option value="0.5">{t.tool.fadeShort}</option>
                  <option value="1.5">{t.tool.fadeLong}</option>
                </select>
              </label>
            </div>
          </div>

          {/* Format / Bitrate & Primary Convert CTA */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs font-semibold text-[#526D82] dark:text-[#9DB2BF] mb-1.5">
                <label htmlFor="export-preset-select">{t.tool.formatLabel}</label>
                <span>
                  {t.tool.estimatedSize}: ~{formatFileSize(estBytes)}
                </span>
              </div>
              <select
                id="export-preset-select"
                value={preset}
                disabled={isBusyEncoding}
                onChange={(e) => {
                  setPreset(e.target.value as ExportPreset);
                  revokeDownloadUrl();
                }}
                className="w-full min-h-[52px] rounded-2xl bg-[#DDE6ED]/60 dark:bg-[#16202E] border border-[#9DB2BF]/50 dark:border-[#526D82]/60 px-4 text-sm sm:text-base font-bold text-[#27374D] dark:text-[#DDE6ED] focus:outline-2 focus:outline-[#526D82]"
              >
                <option value="mp3-320">{t.tool.presetMp3320}</option>
                <option value="mp3-192">{t.tool.presetMp3192}</option>
                <option value="mp3-128">{t.tool.presetMp3128}</option>
                <option value="wav">{t.tool.presetWav}</option>
              </select>
            </div>

            {!isBusyEncoding ? (
              <button
                type="button"
                onClick={handleConvert}
                className="inline-flex items-center justify-center gap-2.5 min-h-[52px] px-7 py-3 rounded-2xl bg-[#526D82] hover:bg-[#27374D] text-white dark:bg-[#9DB2BF] dark:text-[#16202E] dark:hover:bg-[#DDE6ED] text-base sm:text-lg font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.99] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82]"
              >
                <Download className="h-5 w-5" aria-hidden="true" />
                <span>{t.tool.convertButton}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCancelEncode}
                className="inline-flex items-center justify-center gap-2 min-h-[52px] px-6 py-3 rounded-2xl border border-[#526D82]/50 dark:border-[#9DB2BF]/50 text-[#27374D] dark:text-[#DDE6ED] hover:bg-[#DDE6ED] dark:hover:bg-[#27374D] text-sm font-bold transition-colors whitespace-nowrap"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span>{t.tool.cancelButton}</span>
              </button>
            )}
          </div>

          {/* Encoding Progress Bar */}
          {isBusyEncoding && (
            <div className="rounded-2xl bg-[#DDE6ED]/50 dark:bg-[#16202E] p-4 border border-[#9DB2BF]/40 dark:border-[#526D82]/40 animate-fade-slide">
              <div className="flex items-center justify-between text-xs sm:text-sm font-semibold text-[#27374D] dark:text-[#DDE6ED] mb-2">
                <span>{stage === 'rendering' ? t.tool.rendering : t.tool.encoding}</span>
                <span className="tabular-nums">{stage === 'rendering' ? '...' : `${encodePercent}%`}</span>
              </div>
              <div className="h-3 w-full rounded-full bg-[#9DB2BF]/30 dark:bg-[#27374D] overflow-hidden">
                <div
                  className="h-full rounded-full progress-sheen transition-all duration-150"
                  style={{ width: `${stage === 'rendering' ? 12 : Math.max(8, encodePercent)}%` }}
                />
              </div>
            </div>
          )}

          {/* Download Ready Banner */}
          {downloadUrl && !isBusyEncoding && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[#DDE6ED]/70 dark:bg-[#16202E] border border-[#526D82]/35 dark:border-[#9DB2BF]/35 px-4 py-3.5 animate-fade-slide">
              <div className="flex items-center gap-2.5 text-sm font-semibold text-[#27374D] dark:text-[#DDE6ED]">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-[#526D82] dark:text-[#9DB2BF]" aria-hidden="true" />
                <span>{t.tool.conversionDone}</span>
              </div>
              <a
                href={downloadUrl}
                download={downloadName}
                className="inline-flex shrink-0 items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#27374D] hover:bg-[#526D82] text-white dark:bg-[#9DB2BF] dark:text-[#16202E] dark:hover:bg-[#DDE6ED] text-sm font-bold transition-colors"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>{t.tool.downloadAgain}</span>
              </a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
