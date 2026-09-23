import { forwardRef, useState } from 'react';
import type { FormEvent } from 'react';

type MessageInputProps = {
  onSend: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export const MessageInput = forwardRef<HTMLInputElement, MessageInputProps>(function MessageInput(
  { onSend, placeholder = 'Escribe un mensaje...', disabled = false },
  ref,
) {
  const [value, setValue] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = value.trim();

    if (!message) {
      return;
    }

    onSend(message);
    setValue('');
  }

  return (
    <form className="agichat-input-area" onSubmit={handleSubmit}>
      <label className="agichat-sr-only" htmlFor="agichat-message-input">
        Escribe un mensaje
      </label>

      <input
        ref={ref}
        id="agichat-message-input"
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />

      <button type="submit" disabled={disabled || !value.trim()} aria-label="Enviar mensaje">
        ➤
      </button>
    </form>
  );
});
