// The Progress mark: three steadily rising columns under a single limit line —
// build gradually, stay under the line. Colours come from the theme tokens
// where the mark sits on the page, and are fixed where it is a standalone icon.
export function LogoMark({ size = 36, title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="64" height="64" rx="16" fill="#1D4ED8" />
      <rect x="13" y="38" width="10" height="13" rx="3" fill="#BBD2FF" opacity="0.55" />
      <rect x="27" y="28" width="10" height="23" rx="3" fill="#BBD2FF" opacity="0.8" />
      <rect x="41" y="17" width="10" height="34" rx="3" fill="#FFFFFF" />
      <rect x="9" y="14" width="46" height="3" rx="1.5" fill="#FFB629" />
    </svg>
  );
}

export function Logo({ size = 32 }) {
  return (
    <div className="logo" aria-label="Progress">
      <LogoMark size={size} />
      <span className="wordmark">Progress</span>
    </div>
  );
}
