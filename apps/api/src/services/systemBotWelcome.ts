import { messengerStore } from "../store/messengerStore.js";
import { userStore } from "../store/userStore.js";

/**
 * Личный чат с ботом и приветствие при регистрации / создании пользователя.
 */
export function ensureWelcomeDirectChatWithBot(newUser: { id: string; firstName: string }): void {
  const bot = userStore.findSystemBot();
  if (!bot) return;
  if (messengerStore.listDirectBetween(bot.id, newUser.id).length > 0) return;
  const name = newUser.firstName.trim() || "пользователь";
  const text = `Добро пожаловать в систему EduMed, ${name}! Я ваш персональный ассистент, буду рад вам помогать!`;
  messengerStore.createDirectMessage({ fromUserId: bot.id, toUserId: newUser.id, text });
}
