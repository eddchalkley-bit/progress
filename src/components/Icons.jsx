const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const TodayIcon = () => (
  <svg {...base}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
export const LogIcon = () => (
  <svg {...base}><rect x="4.5" y="3.5" width="15" height="17" rx="3" /><path d="M8.5 9h7M8.5 13h7M8.5 17h4" /></svg>
);
export const InsightsIcon = () => (
  <svg {...base}><path d="M4 19.5h16" /><path d="M6.5 16l4-5 3 3 4.5-6.5" /></svg>
);
export const SettingsIcon = () => (
  <svg {...base}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
export const CopyIcon = () => (
  <svg {...base} width="16" height="16"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V6a1 1 0 0 1 1-1h9" /></svg>
);
export const ChevronIcon = () => (
  <svg {...base} width="18" height="18"><path d="M9 6l6 6-6 6" /></svg>
);
export const WatchIcon = () => (
  <svg {...base} width="18" height="18"><rect x="7" y="6" width="10" height="12" rx="3" /><path d="M9 6l.5-3h5l.5 3M9 18l.5 3h5l.5-3" /></svg>
);
