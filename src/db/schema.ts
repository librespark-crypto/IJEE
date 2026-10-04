import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

export const syllabusTopics = pgTable("syllabus_topics", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  unit: text("unit").notNull(),
  chapter: text("chapter").notNull(),
  topic: text("topic").notNull(),
  subtopics: jsonb("subtopics").$type<string[]>().notNull(),
  exams: jsonb("exams").$type<string[]>().notNull(),
  classLevel: integer("class_level").notNull(),
  sortOrder: integer("sort_order").notNull(),
});
