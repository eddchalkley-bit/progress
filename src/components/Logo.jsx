import { useId } from 'react';

// The Progress mark: a calm horizon with a gently rising line and a low sun —
// steady, paced improvement rather than a steep climb.
export function LogoMark({ size = 36, title }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`pg-sky-${id}`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#A9D6CF" />
          <stop offset="0.55" stopColor="#5E9E9A" />
          <stop offset="1" stopColor="#2E6A6F" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="19" fill={`url(#pg-sky-${id})`} />
      <circle cx="43.5" cy="21.5" r="6.5" fill="#F6E7BF" />
      <path d="M11 45.5c7.5 0 10-8.5 18-8.5s10.5-7 23-9.5" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
      <path d="M11 53c9 0 17-3.4 41-5.2" fill="none" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 34 }) {
  return (
    <div className="logo" aria-label="Progress">
      <LogoMark size={size} />
      <span className="wordmark">progress</span>
    </div>
  );
}
