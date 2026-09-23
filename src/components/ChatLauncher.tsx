type ChatLauncherProps = {
  isOpen: boolean;
  onClick: () => void;
};

export function ChatLauncher({ isOpen, onClick }: ChatLauncherProps) {
  return (
    <button
      type="button"
      className="agichat-launcher"
      onClick={onClick}
      aria-label={isOpen ? 'Cerrar chat' : 'Abrir chat'}
      aria-expanded={isOpen}
    >
      <span aria-hidden="true">{isOpen ? '×' : '💬'}</span>
    </button>
  );
}
