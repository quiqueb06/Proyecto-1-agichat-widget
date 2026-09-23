import { forwardRef } from 'react';

type ChatLauncherProps = {
  controlsId?: string;
  isOpen: boolean;
  onClick: () => void;
};

export const ChatLauncher = forwardRef<HTMLButtonElement, ChatLauncherProps>(function ChatLauncher(
  { isOpen, onClick, controlsId },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className="agichat-launcher"
      onClick={onClick}
      aria-label={isOpen ? 'Cerrar chat' : 'Abrir chat'}
      aria-controls={controlsId}
      aria-expanded={isOpen}
    >
      <span aria-hidden="true">{isOpen ? '×' : '💬'}</span>
    </button>
  );
});
