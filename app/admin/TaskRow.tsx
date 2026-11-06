import { withBase } from '@/lib/base';
import { dueLabel, type Task, type TeamMember } from '@/lib/crm';
import { deleteTask, toggleTask } from './actions';
import Avatar from './Avatar';
import ConfirmButton from './ConfirmButton';
import css from './crm.module.css';

// One task: tick it done, see who has it and when it is due, open its lead, or delete it.
export default function TaskRow({ task, member, lead }: { task: Task; member: TeamMember | undefined; lead?: { id: string; name: string } }) {
  const due = dueLabel(task.due_on);
  const done = !!task.done_at;
  return (
    <li className={`${css.task} ${done ? css.taskDone : ''}`}>
      <form action={toggleTask}>
        <input type="hidden" name="task_id" value={task.id} />
        <button type="submit" className={css.tick} aria-pressed={done} aria-label={done ? `Reopen task: ${task.title}` : `Mark done: ${task.title}`}>{done ? '✓' : ''}</button>
      </form>
      <div className={css.taskBody}>
        <b>{task.title}</b>
        <span>
          {lead && <><a href={withBase(`/admin/lead/${lead.id}?tab=tasks`)}>{lead.name}</a>, </>}
          <em className={!done && due.tone === 'bad' ? css.dueBad : !done && due.tone === 'warn' ? css.dueWarn : ''}>{done ? 'Done' : due.text}</em>
        </span>
      </div>
      <span title={member ? `Assigned to ${member.name}` : 'Not assigned'}><Avatar member={member} /></span>
      <form action={deleteTask}>
        <input type="hidden" name="task_id" value={task.id} />
        <ConfirmButton message={`Delete the task "${task.title}"?`} ariaLabel="Delete task" className={css.x}>×</ConfirmButton>
      </form>
    </li>
  );
}
