"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a: ({ children, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer"
      className="text-[#7cb0f0] underline decoration-[#7cb0f0]/40 underline-offset-2 transition-colors hover:decoration-[#7cb0f0]"
    >
      {children}
    </a>
  ),
  // Tabeller är det format systemprompten ber om vid jämförelser, och en
  // jämförelse med många mått blir lätt bredare än chattkolumnen. Egen
  // scroll-wrapper istället för att låta tabellen spränga layouten på mobil.
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-white/10">
      <table className="my-0 w-full border-collapse text-sm">{children}</table>
    </div>
  ),
};

/**
 * Renderar Claudes svar som riktig markdown (rubriker, listor, tabeller,
 * fetstil) istället för att visa rå **asterisk**-syntax i klartext.
 * `prose`-klasserna kommer från @tailwindcss/typography, finjusterade så
 * spacing, färger och typsnitt matchar resten av appen istället för pluginets
 * defaultutseende — brödtexten läggs medvetet på samma dämpade ton (#e8e7e1)
 * som appens övriga text, inte rent vitt.
 */
export function MessageContent({ content }: { content: string }) {
  return (
    <div
      className="prose prose-sm sm:prose-base prose-invert max-w-none text-[#e8e7e1]
        prose-p:leading-[1.75] prose-p:my-3 first:prose-p:mt-0 last:prose-p:mb-0
        prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-white
        prose-headings:mt-5 prose-headings:mb-2 first:prose-headings:mt-0
        prose-h1:text-lg prose-h2:text-base prose-h3:text-[15px]
        prose-strong:font-semibold prose-strong:text-white
        prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:leading-relaxed
        prose-li:marker:text-[#6b6a65]
        prose-blockquote:border-l-2 prose-blockquote:border-[#3987e5]/50
        prose-blockquote:not-italic prose-blockquote:text-[#c3c2b7]
        prose-th:border-b prose-th:border-white/10 prose-th:bg-white/[0.04]
        prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:text-xs
        prose-th:font-semibold prose-th:uppercase prose-th:tracking-wider prose-th:text-[#a3a29b]
        prose-td:border-t prose-td:border-white/[0.06] prose-td:px-3 prose-td:py-2
        prose-code:rounded prose-code:bg-white/[0.08] prose-code:px-1.5 prose-code:py-0.5
        prose-code:text-[0.875em] prose-code:font-normal prose-code:text-[#e8e7e1]
        prose-code:before:content-none prose-code:after:content-none
        prose-pre:my-4 prose-pre:rounded-xl prose-pre:border prose-pre:border-white/10
        prose-pre:bg-[#0f0f11] prose-pre:p-4 prose-pre:text-[13px]
        [&_pre_code]:bg-transparent [&_pre_code]:p-0
        prose-hr:my-5 prose-hr:border-white/10"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
