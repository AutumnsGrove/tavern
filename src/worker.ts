export { GameSession } from "./session";

export interface Env {
  DB: D1Database;
  SRD: KVNamespace;
  GAME_SESSION: DurableObjectNamespace;
  OPENROUTER_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response("ok");
    }

    // Webhook registration endpoint
    if (url.pathname === "/register-webhook" && request.method === "POST") {
      const { TelegramApi } = await import("./telegram/api");
      const api = new TelegramApi(env.TELEGRAM_BOT_TOKEN);
      const webhookUrl = `${url.origin}/webhook`;
      await api.setWebhook(webhookUrl);
      return new Response(JSON.stringify({ ok: true, webhook: webhookUrl }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      const body = await request.json<{
        message?: { chat?: { id: number } };
        callback_query?: { message?: { chat?: { id: number } } };
      }>();

      // Extract chat_id from either message or callback_query
      const chatId =
        body?.message?.chat?.id ??
        body?.callback_query?.message?.chat?.id;

      if (!chatId) {
        return new Response("no chat_id", { status: 400 });
      }

      const id = env.GAME_SESSION.idFromName(String(chatId));
      const stub = env.GAME_SESSION.get(id);
      return stub.fetch(request);
    }

    return new Response("not found", { status: 404 });
  },
};
