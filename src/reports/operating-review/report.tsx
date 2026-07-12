import type { ReactNode } from "react";
import { Page } from "../../unslide/page.js";
import type { OperatingReviewData } from "./data.js";

function Heading({ title, note }: { title: ReactNode; note?: ReactNode }) {
  return (
    <div className="heading">
      <h2>{title}</h2>
      {note && <p>{note}</p>}
    </div>
  );
}

export function OperatingReview({ data }: { data: OperatingReviewData }) {
  const total = 8;
  const label = `${data.company} · ${data.period}`;
  const chrome = (section: string) => ({
    headerLeft: label,
    headerRight: section,
    footerLeft: `Confidential · ${label}`,
  });

  return (
    <main className="report">
      <Page number={1} total={total} className="cover">
        <div className="cover-grid">
          <div className="wordmark">NORTHSTAR / 26</div>
          <div className="cover-index">OPERATING REVIEW</div>
          <div className="cover-main">
            <h1>{data.title}</h1>
            <p>{data.subtitle}</p>
          </div>
          <div className="cover-accent">
            <span>{data.metrics[0].value}</span><small>{data.metrics[0].label}</small>
          </div>
          <div className="cover-meta">
            <span>{data.audience}</span>
            <span>{data.reportDate}</span>
          </div>
        </div>
      </Page>

      <Page number={2} total={total} chrome={chrome("Executive view")}>
        <Heading title="A stronger quarter, with one clear pressure point" />
        <p className="thesis">{data.thesis}</p>
        <div className="metric-line">
          {data.metrics.map((metric) => (
            <article className="metric" key={metric.label}>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span className={metric.status}>{metric.change}</span>
            </article>
          ))}
        </div>
        <div className="decision-strip">
          <strong>Read-through</strong>
          <p>Keep leaning into enterprise; repair SMB retention before restoring acquisition spend.</p>
        </div>
      </Page>

      <Page number={3} total={total} chrome={chrome("Performance trajectory")}>
        <Heading
          title="Revenue and margin are improving together"
          note="Four-quarter management view; revenue bars and gross-margin line use caller-prepared display positions."
        />
        <figure className="trajectory">
          <figcaption>
            <span>Net revenue</span>
            <span className="line-key">Gross margin</span>
          </figcaption>
          <svg viewBox="0 0 900 300" role="img" aria-label="Revenue and gross margin increased over four quarters">
            <line className="axis" x1="40" y1="245" x2="860" y2="245" />
            <polyline
              className="margin-line"
              points={data.quarters.map((quarter, index) => `${145 + index * 205},${quarter.marginY}`).join(" ")}
            />
            {data.quarters.map((quarter, index) => {
              const x = 95 + index * 205;
              const y = 245 - quarter.revenueHeight * 1.65;
              return (
                <g key={quarter.label}>
                  <rect className="revenue-bar" x={x} y={y} width="100" height={quarter.revenueHeight * 1.65} />
                  <circle className="margin-dot" cx={145 + index * 205} cy={quarter.marginY} r="6" />
                  <text className="chart-value" x={145 + index * 205} y={y - 12} textAnchor="middle">{quarter.revenue}</text>
                  <text className="chart-margin" x={145 + index * 205} y={quarter.marginY - 14} textAnchor="middle">{quarter.margin}</text>
                  <text className="chart-label" x={145 + index * 205} y="276" textAnchor="middle">{quarter.label}</text>
                </g>
              );
            })}
          </svg>
        </figure>
        <p className="figure-callout">{data.insights.marginExpansion}</p>
      </Page>

      <Page number={4} total={total} chrome={chrome("Commercial mix")}>
        <Heading title="Enterprise is carrying growth; digital needs a retention reset" />
        <div className="channel-layout">
          <div className="channel-list">
            <div className="channel-key">
              <span>Channel</span><span>Relative growth contribution</span><span>Mix</span><span>Growth</span>
            </div>
            {data.channels.map((channel) => (
              <article className="channel" key={channel.name}>
                <div className="channel-copy">
                  <strong>{channel.name}</strong>
                  <span>{channel.signal}</span>
                </div>
                <div className="channel-bar"><i style={{ width: `${channel.contribution}%` }} /></div>
                <b>{channel.mix}</b>
                <em>{channel.growth}</em>
              </article>
            ))}
          </div>
          <aside className="mix-note">
            <strong>{data.insights.growthConcentration}</strong>
            <p>of quarterly growth came from enterprise expansion and partner-sourced business.</p>
            <hr />
            <span>Decision: keep paid SMB acquisition flat through August.</span>
          </aside>
        </div>
      </Page>

      <Page number={5} total={total} chrome={chrome("Regional performance")}>
        <Heading title="Regional growth is broad; economics remain uneven" />
        <table className="region-table">
          <thead>
            <tr><th>Region</th><th className="num">Revenue</th><th className="num">Growth</th><th className="num">Margin</th><th className="num">vs plan</th><th>Operating note</th></tr>
          </thead>
          <tbody>
            {data.regions.map((region) => (
              <tr key={region.name}>
                <th>{region.name}</th><td className="num">{region.revenue}</td><td className="num">{region.growth}</td><td className="num">{region.margin}</td><td className="num">{region.plan}</td><td>{region.commentary}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="table-readout"><span>Highest growth</span><strong>{data.insights.highestGrowth}</strong><span>Largest margin gap</span><strong>{data.insights.largestMarginGap}</strong></div>
      </Page>

      <Page number={6} total={total} chrome={chrome("한국 사업 / Korea")}>
        <div className="korea-heading">
          <span>Market spotlight</span>
          <h2 lang="ko">{data.korea.headline}</h2>
        </div>
        <div className="bilingual">
          <p lang="ko">{data.korea.summaryKo}</p>
          <p>{data.korea.summaryEn}</p>
        </div>
        <div className="korea-body">
          <div className="korea-metrics">
            {data.korea.accounts.map((account) => (
              <article key={account.name}><span>{account.name}</span><strong>{account.value}</strong><small>{account.note}</small></article>
            ))}
          </div>
          <div className="action-list">
            <strong>하반기 실행 과제</strong>
            <ol>{data.korea.actions.map((action) => <li key={action}>{action}</li>)}</ol>
          </div>
        </div>
      </Page>

      <Page number={7} total={total} chrome={chrome("Second-half execution")}>
        <Heading title="Four priorities translate the quarter into action" note="Measures are operating commitments, not framework-owned calculations." />
        <div className="priority-head"><span>Owner / priority</span><span>Success measure</span><span>Timing</span></div>
        <div className="priorities">
          {data.priorities.map((priority) => (
            <article key={priority.priority}>
              <div><small>{priority.owner}</small><strong>{priority.priority}</strong></div>
              <p>{priority.measure}</p>
              <p>{priority.timing}</p>
              <i className={priority.state}>{priority.state === "on-track" ? "On track" : "Attention"}</i>
            </article>
          ))}
        </div>
        <div className="decision-list"><strong>Committee decisions requested</strong><ol>{data.decisions.map((decision) => <li key={decision}>{decision}</li>)}</ol></div>
      </Page>

      <Page number={8} total={total} chrome={chrome("Appendix")}>
        <Heading title="Definitions and reporting basis" note="The report receives these values already prepared; it does not calculate business performance." />
        <dl className="notes">
          {data.notes.map((note) => <div key={note.label}><dt>{note.label}</dt><dd>{note.text}</dd></div>)}
        </dl>
        <div className="source-map">
          <span>Input</span><strong>Caller-owned typed object</strong><b>→</b><span>Output</span><strong>Standalone fixed-page HTML</strong>
        </div>
        <p className="end-mark">END OF REPORT · {data.reportDate}</p>
      </Page>
    </main>
  );
}
