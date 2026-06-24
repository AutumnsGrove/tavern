import type { Env } from "./worker";

export class GameSession implements DurableObject {
  private env: Env;

  constructor(private state: DurableObjectState, env: Env) {
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // TODO: wire up engine, narrator, and adapter dispatch
    return new Response(JSON.stringify({ status: "session alive" }), {
      headers: { "content-type": "application/json" },
    });
  }
}
