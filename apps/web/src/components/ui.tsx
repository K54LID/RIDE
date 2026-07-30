import type { ReactNode } from 'react';
import { tg } from '../lib/tg';

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function Button({
  children, onClick, disabled, variant = 'primary',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
}) {
  return (
    <button
      className={variant === 'ghost' ? 'btn btn-ghost' : 'btn'}
      disabled={disabled}
      onClick={() => {
        tg.tap('medium');
        onClick?.();
      }}
    >
      {children}
    </button>
  );
}

/** Multi-select chips. Selection is the only interaction, so it owns
    haptic selectionChanged rather than an impact tap. */
export function ChipGroup({
  options, selected, onChange, max,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  return (
    <div className="chips">
      {options.map((opt) => {
        const on = selected.includes(opt);
        const blocked = !on && max !== undefined && selected.length >= max;
        return (
          <button
            key={opt}
            type="button"
            className="chip"
            aria-pressed={on}
            disabled={blocked}
            onClick={() => {
              tg.select();
              onChange(on ? selected.filter((s) => s !== opt) : [...selected, opt]);
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/** Single-select variant — same visual language, radio semantics. */
export function ChipPick({
  options, value, onChange,
}: { options: readonly string[]; value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="chips">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className="chip"
          aria-pressed={value === opt}
          onClick={() => { tg.select(); onChange(opt); }}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', mb = 10 }: { h?: number; w?: string; mb?: number }) {
  return <div className="skel" style={{ height: h, width: w, marginBottom: mb }} />;
}

export function EmptyState({
  title, body, action,
}: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      {action ? <div style={{ marginTop: 20 }}>{action}</div> : null}
    </div>
  );
}
