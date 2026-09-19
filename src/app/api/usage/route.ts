import { NextRequest, NextResponse } from 'next/server';
import { getUsageStats, getUsageSummary } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') ?? '30', 10);
  const type = searchParams.get('type') ?? 'summary';

  if (type === 'timeline') {
    const raw = getUsageStats(days) as {
      provider: string;
      model: string;
      tokens_input: number;
      tokens_output: number;
      cost: number;
      latency: number;
      success: number;
      created_at: number;
    }[];
    return NextResponse.json({ data: raw });
  }

  const summary = getUsageSummary() as {
    provider: string;
    model: string;
    request_count: number;
    total_tokens_input: number;
    total_tokens_output: number;
    total_cost: number;
    avg_latency: number;
    success_count: number;
  }[];

  const totals = summary.reduce(
    (acc, row) => ({
      requests: acc.requests + row.request_count,
      tokensIn: acc.tokensIn + row.total_tokens_input,
      tokensOut: acc.tokensOut + row.total_tokens_output,
      cost: acc.cost + row.total_cost,
    }),
    { requests: 0, tokensIn: 0, tokensOut: 0, cost: 0 }
  );

  return NextResponse.json({ summary, totals });
}
