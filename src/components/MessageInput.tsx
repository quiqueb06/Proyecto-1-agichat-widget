import { useState } from 'react';
import type { FormEvent } from 'react';

type MessageInputProps = {
  onSend: (message: string) => void;
  disabled?: boolean;
};

export function MessageInput({
  onSend,
  disabled = false,
}: MessageInputProps) {
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
        id="agichat-message-input"
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Escribe un mensaje..."
        disabled={disabled}
        autoComplete="off"
      />

      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Enviar mensaje"
      >
        ➤
      </button>
    </form>
  );
}
