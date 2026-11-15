import { useState } from 'react';
import { isTmdbPosterUrl } from './tmdbPosterUrl';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

type MarkdownMessageProps = {
  content: string;
};

function Poster({ src, alt }: { src?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (!isTmdbPosterUrl(src) || failed) return <span>{alt || 'Póster no disponible'}</span>;
  return (
    <img
      className="agichat-poster"
      src={src}
      alt={alt || 'Póster de película'}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
const components = {
  img: ({ src, alt }: { src?: string; alt?: string }) => <Poster key={src} src={src} alt={alt} />,
};

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="agichat-markdown">
      <Markdown
        components={components}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, rehypeHighlight]}
      >
        {content}
      </Markdown>
    </div>
  );
}
