import type { OpenUrlAction } from '../types';

/** Safe URLs already validated by ChatStore; labels are rendered as React text. */
export function ActionLinks({ actions = [] }: { actions?: readonly OpenUrlAction[] }) {
  if (!actions.length) return null;
  return (
    <aside className="agichat-action-links" aria-label="Enlaces del agente">
      <p>
        Si no se abrió una pestaña, permite ventanas emergentes para este sitio o usa estos enlaces:
      </p>
      <ul>
        {actions.map((action) => (
          <li key={action.url}>
            <a href={action.url} target="_blank" rel="noopener noreferrer">
              {action.label}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
