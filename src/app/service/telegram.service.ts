import { TelegramBot } from "typescript-telegram-bot-api";
import {ENV} from "../config/env.config";
import logger from "../config/logger.config";

export class TelegramService {
  private static bot: TelegramBot;

  static init() {
    if (this.bot) return;

    this.bot = new TelegramBot({ botToken: process.env.TELEGRAM_BOT_TOKEN! });
    this.bot.startPolling();

    logger.info("Telegram bot iniciado.");

    this.bot.on("message", async (message) => {
      if (message.text?.toLowerCase() === "/start") {
        this.bot.sendMessage({
          chat_id: message.chat.id,
          text: "Olá! Eu sou o SabIA no Telegram 🚀",
        });
      } else {
        const response = await fetch(`${process.env.URL_API_SABIA}/agent/message?sessionId=${message.chat.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ENV.API_KEY_LOGIN },
          body: JSON.stringify({ message: message.text })
        });

        const data = await response.json();

        this.bot.sendMessage({
          chat_id: message.chat.id,
          text: data.message,
        })
      }
    });

    this.bot.getMe()
      .then((info) => logger.info(info, "Bot info:"))
      .catch(logger.error);
  }
}
