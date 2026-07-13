import type { PropsWithChildren, ReactNode } from "react";

interface PageProps extends PropsWithChildren {
  number: number;
  total: number;
  chrome?: {
    headerLeft: ReactNode;
    headerRight: ReactNode;
    footerLeft: ReactNode;
  };
  className?: string;
}

/** Spike-specific page composition; this is report source, not an Unslide primitive. */
export function Page({ number, total, chrome, className = "", children }: PageProps) {
  return (
    <section className={`page ${className}`} data-unslide-page={String(number)}>
      {chrome && (
        <header className="page-header">
          <span>{chrome.headerLeft}</span>
          <span>{chrome.headerRight}</span>
        </header>
      )}
      <div className="page-content">{children}</div>
      {chrome && (
        <footer className="page-footer">
          <span>{chrome.footerLeft}</span>
          <span>{number} / {total}</span>
        </footer>
      )}
    </section>
  );
}
