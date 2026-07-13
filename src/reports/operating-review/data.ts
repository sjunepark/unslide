interface Metric {
  label: string;
  value: string;
  change: string;
  status: "up" | "watch";
}

interface Quarter {
  label: string;
  revenue: string;
  revenueHeight: number;
  margin: string;
  marginY: number;
}

interface Channel {
  name: string;
  mix: string;
  growth: string;
  signal: string;
  contribution: number;
}

interface Region {
  name: string;
  revenue: string;
  growth: string;
  margin: string;
  plan: string;
  commentary: string;
}

interface Priority {
  owner: string;
  priority: string;
  measure: string;
  timing: string;
  state: "on-track" | "attention";
}

export interface OperatingReviewData {
  company: string;
  period: string;
  reportDate: string;
  audience: string;
  title: string;
  subtitle: string;
  thesis: string;
  metrics: [Metric, ...Metric[]];
  insights: {
    marginExpansion: string;
    growthConcentration: string;
    highestGrowth: string;
    largestMarginGap: string;
  };
  quarters: Quarter[];
  channels: Channel[];
  regions: Region[];
  korea: {
    headline: string;
    summaryKo: string;
    summaryEn: string;
    accounts: Array<{ name: string; value: string; note: string }>;
    actions: string[];
  };
  priorities: Priority[];
  decisions: string[];
  notes: Array<{ label: string; text: string }>;
}

// Fictional example data for demonstrating the report-authoring workflow.
export const operatingReviewData: OperatingReviewData = {
  company: "Northstar Goods",
  period: "Q2 2026",
  reportDate: "13 July 2026",
  audience: "Operating Committee",
  title: "Growth with better economics",
  subtitle:
    "Quarterly operating review · a decision-focused view of revenue quality, regional execution, and second-half priorities.",
  thesis:
    "Enterprise expansion sustained growth while pricing and service discipline began to lift margin. The second half depends on converting that progress into repeatable regional execution.",
  metrics: [
    { label: "Net revenue", value: "$48.2m", change: "+8.4% YoY", status: "up" },
    { label: "Gross margin", value: "41.7%", change: "+1.9 pts", status: "up" },
    { label: "Enterprise NRR", value: "114%", change: "+5 pts", status: "up" },
    { label: "SMB churn", value: "3.8%", change: "+0.6 pts", status: "watch" },
  ],
  insights: {
    marginExpansion: "+280 bps margin expansion across the four-quarter view",
    growthConcentration: "74%",
    highestGrowth: "Korea · +14.6%",
    largestMarginGap: "Latin America · 34.7%",
  },
  quarters: [
    { label: "Q3 25", revenue: "$42.0m", revenueHeight: 56, margin: "38.9%", marginY: 106 },
    { label: "Q4 25", revenue: "$44.1m", revenueHeight: 66, margin: "39.6%", marginY: 93 },
    { label: "Q1 26", revenue: "$46.0m", revenueHeight: 76, margin: "40.8%", marginY: 72 },
    { label: "Q2 26", revenue: "$48.2m", revenueHeight: 88, margin: "41.7%", marginY: 55 },
  ],
  channels: [
    { name: "Enterprise direct", mix: "43%", growth: "+18%", signal: "Expansion-led", contribution: 88 },
    { name: "Mid-market", mix: "31%", growth: "+7%", signal: "Healthy pipeline", contribution: 67 },
    { name: "Digital / SMB", mix: "18%", growth: "−3%", signal: "Retention pressure", contribution: 36 },
    { name: "Partners", mix: "8%", growth: "+12%", signal: "Korea acceleration", contribution: 52 },
  ],
  regions: [
    { name: "North America", revenue: "$20.4m", growth: "+11.2%", margin: "44.8%", plan: "103%", commentary: "Enterprise expansion and pricing" },
    { name: "Europe", revenue: "$12.7m", growth: "+6.9%", margin: "42.1%", plan: "99%", commentary: "Stable retention; slower new logo" },
    { name: "Korea", revenue: "$8.1m", growth: "+14.6%", margin: "39.5%", plan: "106%", commentary: "파트너 채널 및 대형 고객 성장" },
    { name: "Asia Pacific", revenue: "$4.3m", growth: "+2.8%", margin: "36.2%", plan: "95%", commentary: "Service mix remains dilutive" },
    { name: "Latin America", revenue: "$2.7m", growth: "−1.4%", margin: "34.7%", plan: "91%", commentary: "Pricing reset underway" },
  ],
  korea: {
    headline: "한국 사업은 파트너 확대를 통해 성장의 질을 높이고 있습니다",
    summaryKo:
      "2분기 매출은 전년 대비 14.6% 성장했습니다. 신규 파트너가 중견 고객 유입을 확대했고, 주요 엔터프라이즈 고객의 재계약률도 개선되었습니다.",
    summaryEn:
      "Korea grew 14.6% year on year as new partners broadened mid-market reach and enterprise renewals improved.",
    accounts: [
      { name: "Enterprise NRR", value: "118%", note: "+7 pts YoY" },
      { name: "Partner-sourced mix", value: "29%", note: "+11 pts YoY" },
      { name: "Gross margin", value: "39.5%", note: "+2.4 pts YoY" },
    ],
    actions: [
      "상위 20개 파트너 대상 공동 영업 계획 표준화",
      "서비스 범위와 가격 정책을 8월 갱신 계약부터 적용",
      "엔터프라이즈 고객 성공 인력 2명 우선 배치",
    ],
  },
  priorities: [
    { owner: "Commercial", priority: "Convert enterprise pipeline", measure: "$9.5m qualified pipeline", timing: "Q3", state: "on-track" },
    { owner: "Customer", priority: "Reduce SMB early churn", measure: "≤3.2% monthly churn", timing: "Q4", state: "attention" },
    { owner: "Operations", priority: "Standardize service scope", measure: "+120 bps gross margin", timing: "Q4", state: "on-track" },
    { owner: "Korea", priority: "Scale partner motion", measure: "35% partner-sourced mix", timing: "Q4", state: "on-track" },
  ],
  decisions: [
    "Approve two customer-success hires for Korea, funded within the current operating plan.",
    "Hold incremental paid SMB acquisition spend; reassess after the August retention cohort closes.",
    "Adopt the revised service scope for all contracts renewing after 1 August.",
  ],
  notes: [
    { label: "Basis", text: "Management reporting view; unaudited. Currency shown in US dollars." },
    { label: "Revenue", text: "Net revenue after rebates and partner commissions; period values are ready-to-display inputs." },
    { label: "NRR", text: "Trailing-twelve-month recurring revenue from the opening cohort, including expansion and contraction." },
    { label: "Plan", text: "Performance against the Q2 operating plan approved in January 2026." },
    { label: "Rounding", text: "Totals may not add due to rounding. Growth and margin values are supplied by the report caller." },
  ],
};
