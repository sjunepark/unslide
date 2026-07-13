import type { ReactNode } from "react";
import type { SpikeReportData } from "./data.js";

function SectionTitle({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className="section-title">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{children}</h2>
    </div>
  );
}

export function SpikeReport({ data }: { data: SpikeReportData }) {
  return (
    <main className="report">
      <section className="page cover" data-unslide-page="cover">
        <p className="cover-index">FIELD NOTE / 01</p>
        <div className="cover-copy">
          <p className="eyebrow">{data.company} · {data.period}</p>
          <h1>{data.title}</h1>
          <p className="cover-subtitle">{data.subtitle}</p>
        </div>
        <div className="cover-meta">
          <span>Prepared for {data.preparedFor}</span>
          <span>13 July 2026</span>
        </div>
      </section>

      <section className="page snapshot" data-unslide-page="signals">
        <SectionTitle eyebrow="Executive snapshot">Performance remained resilient</SectionTitle>
        <p className="lead">{data.summary}</p>
        <div className="metric-grid">
          {data.metrics.map((metric) => (
            <article className="metric" key={metric.label}>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span className={metric.tone}>{metric.change}</span>
            </article>
          ))}
        </div>
        <div className="takeaway">
          <p className="eyebrow">Management focus</p>
          <p>Protect enterprise momentum while addressing regional margin dispersion.</p>
        </div>
      </section>

      <section className="page regions" data-unslide-page="regions">
        <SectionTitle eyebrow="Regional detail">Growth is broad, with uneven economics</SectionTitle>
        <table>
          <thead>
            <tr>
              <th>Region</th>
              <th className="numeric">Revenue</th>
              <th className="numeric">Growth</th>
              <th className="numeric">Margin</th>
              <th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {data.regions.map((row) => (
              <tr key={row.region}>
                <th>{row.region}</th>
                <td className="numeric">{row.revenue}</td>
                <td className="numeric">{row.growth}</td>
                <td className="numeric">{row.margin}</td>
                <td>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="table-note">Revenue contribution by reporting region; management reporting basis.</p>
      </section>
    </main>
  );
}
