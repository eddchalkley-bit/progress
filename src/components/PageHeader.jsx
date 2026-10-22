import { Logo } from './Logo.jsx';

// Same branded header on every page: the sun-and-horizon mark, then the page title.
export default function PageHeader({ eyebrow, title, right, children }) {
  return (
    <header className="page-head">
      <div className="brand-row">
        <Logo size={32} />
        {right}
      </div>
      <div className="page-title">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children}
      </div>
    </header>
  );
}
