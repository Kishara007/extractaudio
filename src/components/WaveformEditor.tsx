import { useCallback, useEffect, useRef, useState } from 'react';
import { formatTimeDisplay } from '../lib/audio/timeFormat';

interface WaveformEditorProps {
  peaks: Float32Array;
  duration: number;
  startSec: number;
  endSec: number;
  playheadSec: number;
  isPlaying: boolean;
  waveformAriaLabel: string;
  trimStartAriaLabel: string;
  trimEndAriaLabel: string;
  onChangeRange: (nextStart: number, nextEnd: number) => void;
  onSeek: (sec: number) => void;
}

const MIN_TRIM_GAP_SEC = 0.25;

export default function WaveformEditor({
  peaks,
  duration,
  startSec,
  endSec,
  playheadSec,
  isPlaying,
  waveformAriaLabel,
  trimStartAriaLabel,
  trimEndAriaLabel,
  onChangeRange,
  onSeek,
}: WaveformEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
    const handleTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    window.addEventListener('videomp3:theme-change', handleTheme);
    return () => window.removeEventListener('videomp3:theme-change', handleTheme);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const width = el.clientWidth;
      if (width > 0) setContainerWidth(width);
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = containerWidth;
    const height = 136;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const startRatio = Math.max(0, Math.min(1, startSec / duration));
    const endRatio = Math.max(startRatio, Math.min(1, endSec / duration));
    const startX = startRatio * width;
    const endX = endRatio * width;

    // Selected region tint
    ctx.fillStyle = isDark ? 'rgba(82, 109, 130, 0.32)' : 'rgba(157, 178, 191, 0.22)';
    ctx.fillRect(startX, 0, Math.max(2, endX - startX), height);

    // Waveform bars
    const barCount = peaks.length;
    const step = width / barCount;
    const barWidth = Math.max(2, Math.min(4.5, step * 0.62));
    const centerY = height / 2;
    const maxBarHeight = height * 0.78;

    for (let i = 0; i < barCount; i++) {
      const x = i * step + (step - barWidth) / 2;
      const centerX = x + barWidth / 2;
      const inRange = centerX >= startX && centerX <= endX;

      const amp = Math.max(0.06, peaks[i]);
      const barH = amp * maxBarHeight;
      const y = centerY - barH / 2;

      if (inRange) {
        ctx.fillStyle = isDark ? '#9DB2BF' : '#DDE6ED';
      } else {
        ctx.fillStyle = isDark ? 'rgba(82, 109, 130, 0.45)' : 'rgba(157, 178, 191, 0.35)';
      }

      const radius = Math.min(2, barWidth / 2);
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, radius);
      ctx.fill();
    }

    // Playhead indicator
    const playRatio = Math.max(0, Math.min(1, playheadSec / duration));
    const playX = playRatio * width;
    if (isPlaying || (playheadSec > startSec + 0.02 && playheadSec < endSec - 0.02)) {
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 6);
      ctx.lineTo(playX, height - 6);
      ctx.stroke();

      ctx.fillStyle = '#DDE6ED';
      ctx.beginPath();
      ctx.arc(playX, 8, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [peaks, duration, startSec, endSec, playheadSec, isPlaying, containerWidth, isDark]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  const clientXToSeconds = (clientX: number): number => {
    const el = containerRef.current;
    if (!el || duration <= 0) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingHandle || duration <= 0) return;
    const clickedSec = clientXToSeconds(e.clientX);
    const clampedSeek = Math.max(startSec, Math.min(endSec - 0.05, clickedSec));
    onSeek(clampedSeek);
  };

  const handleHandlePointerDown = (handle: 'start' | 'end') => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingHandle(handle);
  };

  const handleHandlePointerMove = (handle: 'start' | 'end') => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (draggingHandle !== handle || duration <= 0) return;
    const sec = clientXToSeconds(e.clientX);
    const minGap = Math.min(MIN_TRIM_GAP_SEC, duration * 0.25);

    if (handle === 'start') {
      const nextStart = Math.max(0, Math.min(endSec - minGap, sec));
      onChangeRange(nextStart, endSec);
    } else {
      const nextEnd = Math.min(duration, Math.max(startSec + minGap, sec));
      onChangeRange(startSec, nextEnd);
    }
  };

  const handleHandlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setDraggingHandle(null);
  };

  const handleHandleKeyDown = (handle: 'start' | 'end') => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (duration <= 0) return;
    const step = e.shiftKey ? 2.5 : 0.5;
    const minGap = Math.min(MIN_TRIM_GAP_SEC, duration * 0.25);

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const delta = e.key === 'ArrowRight' ? step : -step;
      if (handle === 'start') {
        const nextStart = Math.max(0, Math.min(endSec - minGap, startSec + delta));
        onChangeRange(nextStart, endSec);
      } else {
        const nextEnd = Math.min(duration, Math.max(startSec + minGap, endSec + delta));
        onChangeRange(startSec, nextEnd);
      }
    }
  };

  const startPct = duration > 0 ? Math.max(0, Math.min(100, (startSec / duration) * 100)) : 0;
  const endPct = duration > 0 ? Math.max(startPct, Math.min(100, (endSec / duration) * 100)) : 100;

  return (
    <div className="relative select-none">
      <div
        ref={containerRef}
        onPointerDown={handleContainerPointerDown}
        role="region"
        aria-label={waveformAriaLabel}
        className="relative h-[136px] w-full rounded-2xl waveform-stage overflow-hidden border border-[#526D82]/40 shadow-inner cursor-crosshair touch-none"
      >
        <canvas ref={canvasRef} className="block w-full h-full" />

        {/* Start Trim Handle */}
        <button
          type="button"
          role="slider"
          aria-label={trimStartAriaLabel}
          aria-valuemin={0}
          aria-valuemax={Number(Math.max(0, endSec - MIN_TRIM_GAP_SEC).toFixed(1))}
          aria-valuenow={Number(startSec.toFixed(1))}
          aria-valuetext={formatTimeDisplay(startSec)}
          onPointerDown={handleHandlePointerDown('start')}
          onPointerMove={handleHandlePointerMove('start')}
          onPointerUp={handleHandlePointerUp}
          onPointerCancel={handleHandlePointerUp}
          onKeyDown={handleHandleKeyDown('start')}
          style={{ left: `calc(${startPct}% - 10px)` }}
          className="absolute top-0 bottom-0 z-10 w-5 flex items-center justify-center group cursor-ew-resize focus-visible:outline-2 focus-visible:outline-[#DDE6ED]"
        >
          <span className="h-full w-0.5 bg-[#DDE6ED] shadow-sm" />
          <span className="absolute top-1/2 -translate-y-1/2 h-10 w-4 rounded-md bg-[#DDE6ED] text-[#27374D] shadow-md flex flex-col items-center justify-center gap-0.5 group-hover:scale-110 transition-transform">
            <span className="w-2 h-0.5 bg-[#526D82] rounded-full" />
            <span className="w-2 h-0.5 bg-[#526D82] rounded-full" />
            <span className="w-2 h-0.5 bg-[#526D82] rounded-full" />
          </span>
        </button>

        {/* End Trim Handle */}
        <button
          type="button"
          role="slider"
          aria-label={trimEndAriaLabel}
          aria-valuemin={Number(Math.min(duration, startSec + MIN_TRIM_GAP_SEC).toFixed(1))}
          aria-valuemax={Number(duration.toFixed(1))}
          aria-valuenow={Number(endSec.toFixed(1))}
          aria-valuetext={formatTimeDisplay(endSec)}
          onPointerDown={handleHandlePointerDown('end')}
          onPointerMove={handleHandlePointerMove('end')}
          onPointerUp={handleHandlePointerUp}
          onPointerCancel={handleHandlePointerUp}
          onKeyDown={handleHandleKeyDown('end')}
          style={{ left: `calc(${endPct}% - 10px)` }}
          className="absolute top-0 bottom-0 z-10 w-5 flex items-center justify-center group cursor-ew-resize focus-visible:outline-2 focus-visible:outline-[#DDE6ED]"
        >
          <span className="h-full w-0.5 bg-[#DDE6ED] shadow-sm" />
          <span className="absolute top-1/2 -translate-y-1/2 h-10 w-4 rounded-md bg-[#DDE6ED] text-[#27374D] shadow-md flex flex-col items-center justify-center gap-0.5 group-hover:scale-110 transition-transform">
            <span className="w-2 h-0.5 bg-[#526D82] rounded-full" />
            <span className="w-2 h-0.5 bg-[#526D82] rounded-full" />
            <span className="w-2 h-0.5 bg-[#526D82] rounded-full" />
          </span>
        </button>
      </div>
    </div>
  );
}
