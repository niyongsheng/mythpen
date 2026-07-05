import React from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface MarkdownContentProps {
  content: string
  className?: string
}

const components: Components = {
  p: ({ children, ...props }) => (
    <p className="mb-2 last:mb-0" {...props}>
      {children}
    </p>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-[var(--ink)]" {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  code: ({ className, children, ...props }) => {
    // fenced code blocks have a 'language-*' className; no className = inline
    const isInline = !className
    if (isInline) {
      return (
        <code
          className="font-mono text-[0.9em] px-[4px] py-[1px] rounded-[var(--radius-xs)] bg-[var(--canvas-mid)] text-[var(--accent-gold-soft)] break-all"
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code className="block font-mono text-[0.9em] leading-[1.5]" {...props}>
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-[var(--radius-sm)] bg-[var(--canvas-elevated)] border border-[var(--hairline)] p-3 my-2 font-mono text-[0.9em] leading-[1.5] whitespace-pre-wrap break-all">
      {children}
    </pre>
  ),
  ul: ({ children, ...props }) => (
    <ul className="list-disc pl-5 mb-2 space-y-0.5" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="list-decimal pl-5 mb-2 space-y-0.5" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="text-[var(--ink-secondary)]" {...props}>
      {children}
    </li>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-[3px] border-[var(--accent-gold)] pl-3 my-2 text-[var(--ink-tertiary)] italic"
      {...props}
    >
      {children}
    </blockquote>
  ),
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-[var(--accent-gold)] no-underline hover:underline break-all"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="text-[15px] font-semibold text-[var(--ink)] mb-1 mt-3 first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="text-[14px] font-semibold text-[var(--ink)] mb-1 mt-2 first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="text-[13px] font-semibold text-[var(--ink)] mb-1 mt-2 first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="text-[12px] font-semibold text-[var(--ink)] mb-1 mt-2 first:mt-0" {...props}>
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5 className="text-[11px] font-semibold text-[var(--ink-secondary)] mb-1" {...props}>
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6 className="text-[11px] font-medium text-[var(--ink-tertiary)] mb-1" {...props}>
      {children}
    </h6>
  ),
  hr: ({ ...props }) => <hr className="border-t border-[var(--hairline)] my-3" {...props} />,
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full border-collapse text-[0.9em]" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => <thead {...props}>{children}</thead>,
  tbody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
  tr: ({ children, ...props }) => (
    <tr className="border-b border-[var(--hairline)]" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th className="border border-[var(--hairline)] px-2 py-1 font-semibold text-[var(--ink)] text-left" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border border-[var(--hairline)] px-2 py-1 text-[var(--ink-secondary)]" {...props}>
      {children}
    </td>
  ),
  del: ({ children, ...props }) => (
    <del className="line-through text-[var(--ink-tertiary)]" {...props}>
      {children}
    </del>
  ),
  img: ({ alt, src, ...props }) => (
    <img
      src={src}
      alt={alt || ''}
      className="max-w-full h-auto rounded-[var(--radius-sm)] my-2"
      loading="lazy"
      {...props}
    />
  ),
}

export const MarkdownContent = React.memo(function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  if (!content) return null

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
})
