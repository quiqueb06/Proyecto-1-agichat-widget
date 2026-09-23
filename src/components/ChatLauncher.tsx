import { forwardRef } from 'react';

type ChatLauncherProps = {
  isOpen: boolean;
  onClick: () => void;
};

export const ChatLauncher = forwardRef<HTMLButtonElement, ChatLauncherProps>(
  function ChatLauncher({ isOpen, onClick }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className="agichat-launcher"
        onClick={onClick}
        aria-label={isOpen ? 'Cerrar chat' : 'Abrir chat'}
        aria-expanded={isOpen}
      >
        <span aria-hidden="true">{isOpen ? '×' : '💬'}</span>
      </button>
    );
  },
);
