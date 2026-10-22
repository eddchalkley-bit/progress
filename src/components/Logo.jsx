import { useId } from 'react';

// The Progress mark: a sun rising over a calm horizon — each day a fresh start,
// built steadily rather than all at once.
export function LogoMark({ size = 36, title }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`pg-sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A9C6F2" />
          <stop offset="0.62" stopColor="#DCE8FB" />
        </linearGradient>
        <linearGradient id={`pg-sea-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5F8BD6" />
          <stop offset="1" stopColor="#3B64B3" />
        </linearGradient>
        <radialGradient id={`pg-glow-${id}`} cx="0.5" cy="0.62" r="0.5">
          <stop offset="0" stopColor="#FFE7AE" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFE7AE" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`pg-clip-${id}`}><rect width="64" height="64" rx="18" /></clipPath>
      </defs>
      <g clipPath={`url(#pg-clip-${id})`}>
        <rect width="64" height="64" fill={`url(#pg-sky-${id})`} />
        <circle cx="32" cy="39" r="22" fill={`url(#pg-glow-${id})`} />
        <g stroke="#F4B85A" strokeWidth="2.6" strokeLinecap="round">
          <path d="M32 13.5v5" />
          <path d="M17.5 19.5l3.4 3.4" />
          <path d="M46.5 19.5l-3.4 3.4" />
          <path d="M11 32h4.6" />
          <path d="M53 32h-4.6" />
        </g>
        <path d="M18.5 39a13.5 13.5 0 0 1 27 0z" fill="#F7C46A" />
        <rect y="39" width="64" height="25" fill={`url(#pg-sea-${id})`} />
        <path d="M21 45.5h22" stroke="#F7C46A" strokeOpacity="0.85" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M25.5 51h13" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M29 56h6" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M0 39h64" stroke="#FFFFFF" strokeOpacity="0.9" strokeWidth="1.6" />
      </g>
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
