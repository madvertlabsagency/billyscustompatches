'use client';
// A submit button that asks "are you sure?" first, for actions that cannot be undone.
export default function ConfirmButton({ message, children, style, ariaLabel }: { message: string; children: React.ReactNode; style?: React.CSSProperties; ariaLabel?: string }) {
  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      style={style}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
