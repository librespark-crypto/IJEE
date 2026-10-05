"use client";

import { ReviewDashboard } from "@/components/review-dashboard";

export function AnalysisView({ attemptId }: { attemptId: string }) {
  return <ReviewDashboard attemptId={attemptId} />;
}
