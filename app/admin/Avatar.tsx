import { initials, type TeamMember } from '@/lib/crm';
import css from './crm.module.css';

export default function Avatar({ member, size }: { member: TeamMember | undefined; size?: 'lg' }) {
  if (!member) return <span className={`${css.avatar} ${css.avatarNone} ${size === 'lg' ? css.avatarLg : ''}`} title="No owner">?</span>;
  return (
    <span className={`${css.avatar} ${size === 'lg' ? css.avatarLg : ''}`} style={{ '--c': member.color } as React.CSSProperties} title={member.name}>
      {initials(member.name)}
    </span>
  );
}
