import { useEffect, useState } from 'react';
import { BookOpen, BriefcaseBusiness, Coffee, Globe, Moon, Sun } from 'lucide-react';
import { SUPPORTED_LOCALES, isLocaleCode } from '../i18n/locales';
import { useI18n } from '../i18n';
import { openSupportModal } from './SupportModal';

interface NavbarProps {
  currentPath: string;
}

const GITHUB_URL = 'https://github.com/Kishara007/extractaudio';

function BrandMark() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#27374D] text-[#DDE6ED] dark:bg-[#16202E] dark:text-[#9DB2BF] shadow-sm border border-[#526D82]/30">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 13V11M8 17V7M12 20V4M16 16V8M20 14V10"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function GitHubMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

export default function Navbar({ currentPath }: NavbarProps) {
  const { locale, t, setLocale } = useI18n();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      window.localStorage.setItem('theme', next);
    } catch {
      // Ignore storage access errors.
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', next === 'dark' ? '#27374D' : '#DDE6ED');
    }
    window.dispatchEvent(new CustomEvent('videomp3:theme-change', { detail: next }));
  };

  const isHome = currentPath === '/' || currentPath === '';
  const isHowToUse = currentPath === '/how-to-use';
  const isHireMe = currentPath === '/hire-me';

  const iconButtonBase =
    'inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl text-[#27374D] dark:text-[#DDE6ED] hover:bg-[#FFFFFF]/80 dark:hover:bg-[#1E2B3C] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82]';

  const activeMobileIcon = 'bg-[#FFFFFF] dark:bg-[#1E2B3C] text-[#526D82] dark:text-[#9DB2BF] shadow-xs';

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#DDE6ED]/88 dark:bg-[#27374D]/88 border-b border-[#526D82]/15 dark:border-[#9DB2BF]/15">
      <nav
        aria-label="Primary Navigation"
        className="mx-auto max-w-6xl px-3 sm:px-6 h-16 flex items-center justify-between gap-2"
      >
        {/* Desktop Brand */}
        <a
          href="/"
          aria-label={t.nav.homeAria}
          className="hidden lg:inline-flex items-center gap-3 rounded-xl py-1 pr-2 text-[#27374D] dark:text-[#DDE6ED] hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82]"
        >
          <BrandMark />
          <span className="text-lg font-bold tracking-tight whitespace-nowrap">{t.nav.brandTitle}</span>
        </a>

        {/* Desktop Controls (lg and above) */}
        <div className="hidden lg:flex items-center gap-2">
          <a
            href="/how-to-use"
            aria-current={isHowToUse ? 'page' : undefined}
            className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82] ${
              isHowToUse
                ? 'bg-[#FFFFFF] dark:bg-[#1E2B3C] text-[#27374D] dark:text-[#DDE6ED] shadow-xs'
                : 'text-[#526D82] dark:text-[#9DB2BF] hover:text-[#27374D] dark:hover:text-[#DDE6ED] hover:bg-[#FFFFFF]/60 dark:hover:bg-[#1E2B3C]/60'
            }`}
          >
            {t.nav.howToUse}
          </a>

          <a
            href="/hire-me"
            aria-current={isHireMe ? 'page' : undefined}
            className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82] ${
              isHireMe
                ? 'bg-[#FFFFFF] dark:bg-[#1E2B3C] text-[#27374D] dark:text-[#DDE6ED] shadow-xs'
                : 'text-[#526D82] dark:text-[#9DB2BF] hover:text-[#27374D] dark:hover:text-[#DDE6ED] hover:bg-[#FFFFFF]/60 dark:hover:bg-[#1E2B3C]/60'
            }`}
          >
            {t.nav.hireMe}
          </a>

          <button
            type="button"
            onClick={openSupportModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#526D82] hover:bg-[#27374D] text-white dark:bg-[#9DB2BF] dark:text-[#16202E] dark:hover:bg-[#DDE6ED] text-sm font-semibold shadow-xs transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82]"
          >
            <Coffee className="h-4 w-4" aria-hidden="true" />
            <span>{t.nav.support}</span>
          </button>

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.nav.githubAria}
            title="GitHub"
            className={iconButtonBase}
          >
            <GitHubMark />
          </a>

          {/* Desktop 8-Language Selector */}
          <div className="relative flex items-center">
            <Globe
              className="pointer-events-none absolute left-3 h-4 w-4 text-[#526D82] dark:text-[#9DB2BF]"
              aria-hidden="true"
            />
            <select
              value={locale}
              onChange={(e) => {
                if (isLocaleCode(e.target.value)) {
                  setLocale(e.target.value);
                }
              }}
              aria-label={t.nav.languageAria}
              className="h-11 pl-9 pr-3 rounded-xl bg-[#FFFFFF]/90 dark:bg-[#1E2B3C] border border-[#9DB2BF]/45 dark:border-[#526D82]/50 text-sm font-medium text-[#27374D] dark:text-[#DDE6ED] hover:border-[#526D82] dark:hover:border-[#9DB2BF] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82]"
            >
              {SUPPORTED_LOCALES.map((loc) => (
                <option key={loc.code} value={loc.code}>
                  {loc.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'light' ? t.nav.themeToggleDarkAria : t.nav.themeToggleLightAria}
            className={`${iconButtonBase} bg-[#FFFFFF]/80 dark:bg-[#1E2B3C] border border-[#9DB2BF]/40 dark:border-[#526D82]/40`}
          >
            {theme === 'light' ? (
              <Moon className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Sun className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Mobile & Tablet Ultra-Minimal Icons-Only Navigation (< lg, 44x44px touch targets) */}
        <div className="flex lg:hidden w-full items-center justify-between gap-1">
          <a
            href="/"
            aria-label={t.nav.homeAria}
            aria-current={isHome ? 'page' : undefined}
            className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82] ${
              isHome ? 'ring-2 ring-[#526D82] dark:ring-[#9DB2BF]' : ''
            }`}
          >
            <BrandMark />
          </a>

          <div className="flex items-center gap-1">
            <a
              href="/how-to-use"
              aria-label={t.nav.howToUseAria}
              aria-current={isHowToUse ? 'page' : undefined}
              className={`${iconButtonBase} ${isHowToUse ? activeMobileIcon : ''}`}
            >
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </a>

            <a
              href="/hire-me"
              aria-label={t.nav.hireMeAria}
              aria-current={isHireMe ? 'page' : undefined}
              className={`${iconButtonBase} ${isHireMe ? activeMobileIcon : ''}`}
            >
              <BriefcaseBusiness className="h-5 w-5" aria-hidden="true" />
            </a>

            <button
              type="button"
              onClick={openSupportModal}
              aria-label={t.nav.supportAria}
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl bg-[#526D82] text-white dark:bg-[#9DB2BF] dark:text-[#16202E] hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82]"
            >
              <Coffee className="h-5 w-5" aria-hidden="true" />
            </button>

            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t.nav.githubAria}
              className={iconButtonBase}
            >
              <GitHubMark />
            </a>

            {/* Icons-only 8-Language Selector with 44x44px touch target */}
            <div className="relative min-w-[44px] min-h-[44px] w-11 h-11 flex items-center justify-center">
              <span className={iconButtonBase} aria-hidden="true">
                <Globe className="h-5 w-5" />
              </span>
              <select
                value={locale}
                onChange={(e) => {
                  if (isLocaleCode(e.target.value)) {
                    setLocale(e.target.value);
                  }
                }}
                aria-label={t.nav.languageAria}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc.code} value={loc.code}>
                    {loc.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? t.nav.themeToggleDarkAria : t.nav.themeToggleLightAria}
              className={iconButtonBase}
            >
              {theme === 'light' ? (
                <Moon className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Sun className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
}
