import { render, screen } from '@testing-library/react';
import { MarkdownMessage } from './MarkdownMessage';

describe('MarkdownMessage', () => {
  it('renderiza texto, encabezados, negrita y cursiva', () => {
    render(<MarkdownMessage content={'# Título\n\nTexto **fuerte** y *énfasis*.'} />);
    expect(screen.getByRole('heading', { name: 'Título' })).toBeInTheDocument();
    expect(screen.getByText('fuerte').tagName).toBe('STRONG');
    expect(screen.getByText('énfasis').tagName).toBe('EM');
  });

  it('renderiza listas', () => {
    render(<MarkdownMessage content={'- uno\n- dos'} />);
    expect(screen.getByRole('list').children).toHaveLength(2);
  });

  it('renderiza enlaces seguros', () => {
    render(<MarkdownMessage content="[AGIChat](https://example.com)" />);
    expect(screen.getByRole('link', { name: 'AGIChat' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
  });

  it('renderiza código inline y bloques resaltados por lenguaje', () => {
    const { container } = render(
      <MarkdownMessage content={'Usa `const`.\n\n```js\nconst ready = true;\n```'} />,
    );
    expect(container.querySelector('p code')).toHaveTextContent('const');
    expect(container.querySelector('pre code')).toHaveClass('language-js');
    expect(container.querySelector('.hljs-keyword')).toBeInTheDocument();
  });

  it('renderiza tablas GFM', () => {
    render(<MarkdownMessage content={'| Nombre | Estado |\n| --- | --- |\n| AGIChat | listo |'} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Nombre' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'listo' })).toBeInTheDocument();
  });

  it('tolera Markdown incompleto durante streaming', () => {
    expect(() => render(<MarkdownMessage content="**respuesta parcial" />)).not.toThrow();
    expect(screen.getByText('**respuesta parcial')).toBeInTheDocument();
  });

  it('no interpreta HTML peligroso ni conserva manejadores', () => {
    const { container } = render(
      <MarkdownMessage content={'<img src="x" onerror="alert(1)"><script>alert(1)</script>'} />,
    );
    expect(container.querySelector('img, script')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('<img');
    expect(container.textContent).toContain('alert(1)');
    expect(container.querySelector('[onerror]')).not.toBeInTheDocument();
  });

  it('elimina destinos de enlace con protocolo javascript', () => {
    const { container } = render(<MarkdownMessage content="[abrir](javascript:alert(1))" />);
    expect(screen.getByText('abrir')).not.toHaveAttribute('href');
    expect(container.querySelector('[href^="javascript:"]')).not.toBeInTheDocument();
  });
});
