import { DiscordBot, loadConfig } from "./src/index.js";
import { SessionManager } from "./src/session-manager.js";

// Load config from env
const config = loadConfig({
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
  BOT_TRIGGER: process.env.BOT_TRIGGER,
  AI_PROVIDER: process.env.AI_PROVIDER,
  AI_CLI_PATH: process.env.AI_CLI_PATH,
  AI_MODEL: process.env.AI_MODEL,
  SESSION_TIMEOUT_MS: process.env.SESSION_TIMEOUT_MS,
  MAX_OUTPUT_LENGTH: process.env.MAX_OUTPUT_LENGTH,
  MAX_CONCURRENT_SESSIONS: process.env.MAX_CONCURRENT_SESSIONS,
  ALLOWED_USERS: process.env.ALLOWED_USERS,
  ADMIN_USERS: process.env.ADMIN_USERS,
});

// Create bot and session manager
const bot = new DiscordBot(config);
const sessions = new SessionManager(config);

// Handle incoming messages
bot.onMessage(async (msg) => {
  // Access control
  if (config.allowedUsers.length > 0 && !config.allowedUsers.includes(msg.source)) {
    return;
  }

  // Extract prompt (remove trigger word in guilds)
  let prompt = msg.text;
  if (msg.isGuild) {
    const trigger = config.botTrigger.toLowerCase();
    if (prompt.toLowerCase().startsWith(trigger)) {
      prompt = prompt.slice(config.botTrigger.length).trim();
    }
    // Also check for @mention
    const botId = bot.getBotUserId();
    if (botId) {
      const mention = new RegExp(`<@!?${botId}>\\s*`);
      prompt = prompt.replace(mention, "").trim();
    }
  }

  if (!prompt) return;

  // Show typing indicator
  await bot.sendTyping(msg.channelId);

  try {
    const result = await sessions.sendMessage(msg.channelId, prompt, msg.sourceName);

    if (result.is_error) {
      await bot.reply(msg, `Error: ${result.result}`);
      return;
    }

    // Send response (chunk if too long)
    const chunks = result.result.match(/.{1,1900}/g) || [result.result];
    for (const chunk of chunks) {
      await bot.reply(msg, chunk);
    }
  } catch (err) {
    await bot.reply(msg, `Error: ${err}`);
  }
});

// Start the bot
async function main() {
  await bot.start();
  console.log("Bot is running. Press Ctrl+C to stop.");
}

main().catch(console.error);