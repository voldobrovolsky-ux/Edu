/**
 * События учебников/парсера (Архстандарт §6, namespace edustore.textbook.*).
 * Замыкает вход в верх пайплайна движка: doc.file.enriched → textbook.parsed → КТП.
 */
export const TEXTBOOK_EVENTS = {
  uploaded: 'edustore.textbook.uploaded', // учитель загрузил учебник (Material создан)
  parsed: 'edustore.textbook.parsed', // парсер разобрал textExtract на темы/карты
} as const;

export interface TextbookUploadedV1 {
  materialId: string;
  disciplineId: string;
  fileId: string; // ссылка на doc File (НЕ s3Key)
}

/** Карта — обучающая единица (стаб-разбор; позже — реальный классификатор). */
export interface ParsedCard {
  order: number;
  title: string;
  topicOrder?: number; // к какой теме относится (order темы), если распознано
}

/** Тема — раздел учебника; источник для наполнения KtpTopic при формировании КТП (связка отложена). */
export interface ParsedTopic {
  order: number;
  title: string;
}

export interface TextbookParsedV1 {
  materialId: string;
  fileId: string; // РОВНО fileId (не s3Key) — материал резолвится по нему
  cards: ParsedCard[];
  topics: ParsedTopic[];
}
