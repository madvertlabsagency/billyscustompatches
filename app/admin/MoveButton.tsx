import { moveLead } from './actions';

// Moves a lead to one stage. Each button is its own form with the target stage in a hidden field,
// because a server action form does not send the clicked button's own name and value.
export default function MoveButton({
  leadId,
  to,
  children,
  className,
  style,
  disabled,
  ariaLabel,
  ariaPressed,
  title,
}: {
  leadId: string;
  to: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  ariaLabel?: string;
  ariaPressed?: boolean;
  title?: string;
}) {
  return (
    <form action={moveLead} style={{ display: 'contents' }}>
      <input type="hidden" name="id" value={leadId} />
      <input type="hidden" name="lead_status" value={to} />
      <button type="submit" className={className} style={style} disabled={disabled || !to} aria-label={ariaLabel} aria-pressed={ariaPressed} title={title}>
        {children}
      </button>
    </form>
  );
}
