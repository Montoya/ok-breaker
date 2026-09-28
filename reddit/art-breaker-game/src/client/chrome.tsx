import type { ButtonHTMLAttributes, ReactNode } from 'react';

const letters = ['A', 'R', 'T', 'B', 'R', 'E', 'A', 'K', 'E', 'R'];

export const Brand = () => (
  <span className="brand" aria-label="Art Breaker">
    <span className="brand-bricks" aria-hidden="true">
      {letters.map((letter, index) => <span className={index === 3 ? 'word-start' : ''} key={`${letter}-${index}`}>{letter}</span>)}
    </span>
  </span>
);

export const Header = ({ className, muted, onSound, subtitle }: { className?: string; muted: boolean; onSound: () => void; subtitle?: string }) => (
  <header className={`site-header${className ? ` ${className}` : ''}`}>
    <div className="header-copy"><Brand />{subtitle && <p className="preview-tagline">{subtitle}</p>}</div>
    <button className="icon-button" type="button" aria-pressed={muted} aria-label={muted ? 'Turn sound on' : 'Mute sound'} onClick={onSound}>
      <span className="sound-icon" aria-hidden="true">♪</span>
    </button>
  </header>
);

export const BoardLoader = ({ label = 'Loading board…' }: { label?: string }) => (
  <>
    <span className="board-loader" aria-hidden="true"><i /><i /><i /><i /></span>
    <strong>{label}</strong>
  </>
);

export const ArcadeButton = ({ children, tone = 'secondary', ...props }: {
  children: ReactNode;
  tone?: 'primary' | 'secondary' | 'blue' | 'danger';
} & ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button className={`arcade-button ${tone}`} type="button" {...props}>{children}</button>
);
