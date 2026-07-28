/** События документохранилища (Архстандарт §6, namespace edustore.doc.*). */
export const DOC_EVENTS = {
  fileCreated: 'edustore.doc.file.created',
  fileEnriched: 'edustore.doc.file.enriched', // → индекс поиска, педагог-парсер (textbook.parsed)
  fileVersioned: 'edustore.doc.file.versioned',
  fileAccessChanged: 'edustore.doc.file.access.changed',
  fileStatusChanged: 'edustore.doc.file.status.changed',
  fileShared: 'edustore.doc.file.shared',
  fileDeleted: 'edustore.doc.file.deleted',
  docEdited: 'edustore.doc.doc.edited',
} as const;

export interface FileCreatedV1 {
  fileId: string;
  s3Key: string; // внутри хранилища
  scope: string;
}
export interface FileEnrichedV1 {
  fileId: string;
  textExtract: string | null;
  tags: string[];
}
