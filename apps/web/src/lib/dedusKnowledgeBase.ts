export type AidTargetId = string;

export interface AidFaq {
  question: string;
  answer: string;
}

export interface AidEntry {
  id: AidTargetId;
  title: string;
  description: string;
  faq: AidFaq[];
}

export const DEDUS_KNOWLEDGE_BASE: AidEntry[] = [
  {
    id: "journal.revisionButton",
    title: "Ревизия журнала",
    description: "Позволяет проверить и зафиксировать оценки за период по правилам школы.",
    faq: [
      { question: "Когда делать ревизию?", answer: "Обычно в конце четверти или по регламенту администрации." },
      { question: "Кто видит результаты?", answer: "Доступ зависит от роли: классные руководители и администрация видят сводки в аналитике." },
    ],
  },
  {
    id: "journal.panelsGrid",
    title: "Выбор журнала",
    description: "Здесь вы открываете таблицу оценок для пары «класс + предмет» или выбираете класс как руководитель.",
    faq: [
      { question: "Нет моего предмета?", answer: "Связки задаются в нагрузке (TeacherLoad). Обратитесь к завучу или администратору." },
    ],
  },
  {
    id: "documents.uploadRoutes",
    title: "Связи выгрузки документов",
    description: "Настраивается, в какие папки и разделы дублируются файлы из журнала, методкабинета и других источников.",
    faq: [
      { question: "Можно несколько целей?", answer: "Да, для одного источника можно добавить несколько папок или разделов." },
    ],
  },
  {
    id: "timetable.weekGrid",
    title: "Сетка расписания",
    description: "Недельный вид уроков и событий. Ячейки отражают слоты, группы и подстановки.",
    faq: [
      { question: "Почему ячейка пустая?", answer: "Возможно, нет назначенного урока на этот слот или нет прав на просмотр." },
    ],
  },
  {
    id: "personalization.preview",
    title: "Предпросмотр персонализации",
    description: "Плавающее окно показывает, как будут выглядеть панели и тема до сохранения.",
    faq: [
      { question: "Как сохранить?", answer: "Используйте кнопки в предпросмотре или форме настроек на этой странице." },
    ],
  },
  {
    id: "methospace.disciplines",
    title: "Методкабинет",
    description: "Список дисциплин и переход к карточке предмета: материалы, диапазоны оценок, документы.",
    faq: [
      { question: "Где документы предмета?", answer: "На странице дисциплины в блоке «Документы дисциплины»." },
    ],
  },
  {
    id: "communitoria.openFlorium",
    title: "Flörium / Communitoria",
    description: "Модуль сообщений и сообществ: чаты, группы, уведомления в отдельной оболочке.",
    faq: [
      { question: "Где старый пункт «Чаты»?", answer: "Он перенесён в Flörium; откройте раздел из меню или кнопки быстрого входа." },
    ],
  },
  {
    id: "taskTracker.addTask",
    title: "Новая задача",
    description: "Создание напоминания или задачи с дедлайном для отслеживания в трекере.",
    faq: [
      { question: "Где видны дедлайны?", answer: "На странице трекера и во всплывающих напоминаниях при приближении срока." },
    ],
  },
  {
    id: "main.sectionNav",
    title: "Главная секция",
    description: "Обзор раздела «Главная»: быстрые ссылки и сводка по кабинету.",
    faq: [
      { question: "Как перейти в журнал?", answer: "Используйте левое меню или карточки на главной странице секции." },
    ],
  },
];

export function dedusEntryForTarget(id: string | null): AidEntry | undefined {
  if (!id) return undefined;
  return DEDUS_KNOWLEDGE_BASE.find((e) => e.id === id);
}
