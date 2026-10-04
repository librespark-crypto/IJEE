"use client";

import { useParams } from "next/navigation";
import { ExamRoom } from "@/components/exam-room";

export default function ExamPage() {
  const params = useParams<{ attemptId: string }>();
  const attemptId = Array.isArray(params.attemptId) ? params.attemptId[0] : params.attemptId;
  if (!attemptId) return null;
  return <ExamRoom attemptId={attemptId} />;
}
