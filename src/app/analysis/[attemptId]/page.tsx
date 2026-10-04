"use client";

import { useParams } from "next/navigation";
import { AnalysisView } from "@/components/analysis-view";

export default function AnalysisPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = Array.isArray(params.attemptId) ? params.attemptId[0] : params.attemptId;
  if (!attemptId) return null;
  return <AnalysisView attemptId={attemptId} />;
}
