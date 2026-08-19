"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
};

/**
 * Renderar Claudes svar som riktig markdown (rubriker, listor, tabeller,
 * fetstil) istället för att visa rå **asterisk**-syntax i klartext.
 * `prose`-klasserna kommer från @tailwindcss/typography, finjusterade så
 * spacing och typsnitt matchar resten av appen istället för pluginets
 * defaultutseende.
 */
export function MessageContent({ content }: { content: string }) {
  return (
    <div
      className="prose prose-sm sm:prose-base prose-invert max-w-none
        prose-p:leading-relaxed prose-p:my-2 first:prose-p:mt-0 last:prose-p:mb-0
        prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2 first:prose-headings:mt-0
        prose-strong:font-semibold prose-strong:text-current
        prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
        prose-table:text-sm prose-th:text-left prose-th:font-medium
        prose-hr:my-4 prose-hr:border-white/15"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
