export interface ReportMetric {
  label: string;
  value: string;
  change: string;
  tone: "positive" | "neutral";
}

export interface RegionRow {
  region: string;
  revenue: string;
  growth: string;
  margin: string;
  note: string;
}

export interface SpikeReportData {
  company: string;
  period: string;
  title: string;
  subtitle: string;
  preparedFor: string;
  summary: string;
  metrics: ReportMetric[];
  regions: RegionRow[];
}

// Fictional example data for demonstrating the report-authoring workflow.
export const spikeReportData: SpikeReportData = {
  company: "Northstar Goods",
  period: "Q2 2026",
  title: "Quarterly performance review",
  subtitle: "Growth held while the business shifted toward higher-value accounts.",
  preparedFor: "Operating committee",
  summary:
    "Revenue finished ahead of plan as enterprise expansion offset a softer small-business channel. Margin improvement remains the clearest near-term opportunity.",
  metrics: [
    { label: "Net revenue", value: "$48.2m", change: "+8.4% YoY", tone: "positive" },
    { label: "Gross margin", value: "41.7%", change: "+1.9 pts", tone: "positive" },
    { label: "Active accounts", value: "12,840", change: "+3.1%", tone: "neutral" },
  ],
  regions: [
    { region: "North America", revenue: "$20.4m", growth: "+11.2%", margin: "44.8%", note: "Enterprise expansion" },
    { region: "Europe", revenue: "$12.7m", growth: "+6.9%", margin: "42.1%", note: "Stable retention" },
    { region: "Korea", revenue: "$8.1m", growth: "+14.6%", margin: "39.5%", note: "신규 채널 성장" },
    { region: "Asia Pacific", revenue: "$4.3m", growth: "+2.8%", margin: "36.2%", note: "Mix pressure" },
    { region: "Latin America", revenue: "$2.7m", growth: "−1.4%", margin: "34.7%", note: "Pricing reset" },
  ],
};
