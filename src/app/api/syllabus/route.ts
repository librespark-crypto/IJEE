import { db } from "@/db";
import { syllabusTopics } from "@/db/schema";
import { SYLLABUS, SYLLABUS_SOURCE } from "@/lib/syllabus";
import { count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const existing = await db.select({ value: count() }).from(syllabusTopics);
    const total = Number(existing[0]?.value ?? 0);
    if (total === 0) {
      const rows = SYLLABUS.map((item, index) => ({
        id: item.id,
        subject: item.subject,
        unit: item.unit,
        chapter: item.chapter,
        topic: item.topic,
        subtopics: item.subtopics,
        exams: item.exams,
        classLevel: item.classLevel,
        sortOrder: index,
      }));
      for (let i = 0; i < rows.length; i += 40) {
        await db.insert(syllabusTopics).values(rows.slice(i, i + 40)).onConflictDoNothing();
      }
    }
    const topics = await db.select().from(syllabusTopics);
    return Response.json({ ok: true, source: "postgres", meta: SYLLABUS_SOURCE, count: topics.length });
  } catch {
    return Response.json({
      ok: true,
      source: "bundle",
      meta: SYLLABUS_SOURCE,
      count: SYLLABUS.length,
      note: "Official catalog is bundled for offline use. Database catalog is not ready.",
    });
  }
}
