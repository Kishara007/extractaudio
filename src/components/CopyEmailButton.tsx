import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useI18n } from '../i18n';

interface CopyEmailButtonProps {
  email: string;
}

export default function CopyEmailButton({ email }: CopyEmailButtonProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(email);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2400);
        return;
      }
    } catch {
      // Fallback below opens mail client if clipboard permissions are restricted.
    }
    window.location.href = `mailto:${email}`;
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-3 rounded-xl border border-[#526D82]/40 dark:border-[#9DB2BF]/40 bg-[#FFFFFF] dark:bg-[#16202E] text-[#27374D] dark:text-[#DDE6ED] hover:bg-[#DDE6ED]/70 dark:hover:bg-[#27374D] font-semibold text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526D82]"
      aria-live="polite"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-[#526D82] dark:text-[#9DB2BF]" aria-hidden="true" />
          <span>{t.hireMe.emailCopied}</span>
        </>
      ) : (
        <>
          <Copy className="h-4 w-4 text-[#526D82] dark:text-[#9DB2BF]" aria-hidden="true" />
          <span>{t.hireMe.copyEmail}</span>
        </>
      )}
    </button>
  );
}
