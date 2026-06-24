/**
 * OpenRouter LLM client. OpenAI-compatible chat completions API
 * with tool calling support. Pure HTTP — no game logic here.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface CompletionResult {
  message: ChatMessage;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
  finishReason: string;
}

export interface ClientOptions {
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

export class NarratorClient {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(opts: ClientOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.maxTokens = opts.maxTokens ?? 4096;
    this.temperature = opts.temperature ?? 0.8;
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDef[],
  ): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": "https://github.com/tavern-game",
        "X-Title": "Tavern",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new NarratorError(
        `OpenRouter API error ${response.status}: ${errorText}`,
        response.status,
      );
    }

    const data = (await response.json()) as {
      choices: Array<{
        message: ChatMessage;
        finish_reason: string;
      }>;
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      model: string;
    };

    const choice = data.choices[0];
    if (!choice) {
      throw new NarratorError("No choices returned from OpenRouter", 500);
    }

    return {
      message: choice.message,
      usage: data.usage,
      model: data.model,
      finishReason: choice.finish_reason,
    };
  }

  setModel(model: string): void {
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }
}

export class NarratorError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "NarratorError";
  }
}
