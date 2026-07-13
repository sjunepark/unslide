import type { PropsWithChildren, ReactNode } from "react";

export interface PageChrome {
  headerLeft: ReactNode;
  headerRight: ReactNode;
  footerLeft: ReactNode;
}

interface PageProps extends PropsWithChildren {
  number: number;
  total: number;
  chrome?: PageChrome;
  className?: string;
}

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
