import { useEffect, useRef, useState } from 'react';
import { Coffee, ExternalLink, X } from 'lucide-react';
import { useI18n } from '../i18n';

export const SUPPORT_MODAL_EVENT = 'videomp3:open-support';
const GUMROAD_COFFEE_URL = 'https://kisharadilshan.gumroad.com/coffee';

export function openSupportModal(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SUPPORT_MODAL_EVENT));
  }
}

export default function SupportModal() {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showFallbackNotice, setShowFallbackNotice] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleOpen = () => {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setIframeLoaded(false);
      setShowFallbackNotice(false);
      setIsOpen(true);
    };
    window.addEventListener(SUPPORT_MODAL_EVENT, handleOpen);
    return () => window.removeEventListener(SUPPORT_MODAL_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 20);

    const fallbackTimer = window.setTimeout(() => {
      setShowFallbackNotice(true);
    }, 3500);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
      window.clearTimeout(fallbackTimer);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#27374D]/75 dark:bg-[#0D1520]/82 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-modal-title"
        className="relative w-full max-w-2xl rounded-3xl bg-[#FFFFFF] dark:bg-[#1E2B3C] text-[#27374D] dark:text-[#DDE6ED] border border-[#9DB2BF]/40 dark:border-[#526D82]/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-fade-slide"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6 sm:py-5 border-b border-[#9DB2BF]/30 dark:border-[#526D82]/40 bg-[#DDE6ED]/50 dark:bg-[#16202E]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#526D82] text-white dark:bg-[#9DB2BF] dark:text-[#16202E]">
              <Coffee className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="support-modal-title" className="text-lg sm:text-xl font-bold tracking-tight">
                {t.supportModal.title}
              </h2>
              <p className="text-xs sm:text-sm text-[#526D82] dark:text-[#9DB2BF] mt-0.5 leading-snug">
                {t.supportModal.subtitle}
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label={t.supportModal.closeAria}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#526D82] hover:text-[#27374D] hover:bg-[#9DB2BF]/25 dark:text-[#9DB2BF] dark:hover:text-[#DDE6ED] dark:hover:bg-[#526D82]/35 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Embedded Gumroad Frame with Skeleton */}
        <div className="relative flex-1 min-h-[340px] sm:min-h-[420px] bg-[#DDE6ED]/35 dark:bg-[#16202E]/60">
          {!iframeLoaded && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center pointer-events-none"
              aria-hidden="true"
            >
              <div className="w-full max-w-sm space-y-3 animate-pulse">
                <div className="mx-auto h-12 w-12 rounded-2xl bg-[#9DB2BF]/40 dark:bg-[#526D82]/50" />
                <div className="mx-auto h-4 w-3/4 rounded-full bg-[#9DB2BF]/40 dark:bg-[#526D82]/50" />
                <div className="mx-auto h-3 w-1/2 rounded-full bg-[#9DB2BF]/30 dark:bg-[#526D82]/40" />
                <div className="h-28 w-full rounded-2xl bg-[#9DB2BF]/25 dark:bg-[#526D82]/30 mt-4" />
              </div>
              <p className="text-sm font-medium text-[#526D82] dark:text-[#9DB2BF]">
                {t.supportModal.loading}
              </p>
            </div>
          )}

          <iframe
            src={GUMROAD_COFFEE_URL}
            title={t.supportModal.iframeTitle}
            className={`w-full h-[360px] sm:h-[430px] border-0 transition-opacity duration-300 ${
              iframeLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            loading="eager"
            onLoad={() => setIframeLoaded(true)}
            onError={() => {
              setIframeLoaded(true);
              setShowFallbackNotice(true);
            }}
          />
        </div>

        {/* Always-available styled Fallback Card inside modal (never auto-opens external tab) */}
        <div
          className={`px-5 py-4 sm:px-6 border-t border-[#9DB2BF]/30 dark:border-[#526D82]/40 transition-colors ${
            showFallbackNotice
              ? 'bg-[#DDE6ED]/75 dark:bg-[#27374D]/80'
              : 'bg-[#FFFFFF] dark:bg-[#1E2B3C]'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#27374D] dark:text-[#DDE6ED]">
                {t.supportModal.fallbackTitle}
              </p>
              <p className="text-xs text-[#526D82] dark:text-[#9DB2BF] mt-0.5">
                {t.supportModal.fallbackBody}
              </p>
            </div>
            <a
              href={GUMROAD_COFFEE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#526D82] hover:bg-[#27374D] text-white dark:bg-[#9DB2BF] dark:text-[#16202E] dark:hover:bg-[#DDE6ED] text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82]"
            >
              <span>{t.supportModal.openExternal}</span>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
