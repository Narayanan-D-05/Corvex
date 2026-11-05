export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M6 12 L40 32" />
      <path d="M6 52 L40 32" />
      <path d="M6 32 H58" />
      <circle cx="40" cy="32" r="5.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-sans text-xl font-semibold tracking-tight ${className}`}>
      <LogoMark />
      Corvex
    </span>
  );
}
