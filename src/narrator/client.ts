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
    // Defaults are in config.ts — import there if you need them.
    // Here we just accept whatever the caller passes.
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

  async chatStream(
    messages: ChatMessage[],
    tools?: ToolDef[],
    onDelta?: (text: string) => void,
  ): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      stream: true,
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

    // Parse SSE stream
    let content = "";
    const toolCallParts = new Map<number, { id: string; name: string; args: string }>();
    let model = this.model;
    let finishReason = "stop";
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        let chunk: Record<string, unknown>;
        try { chunk = JSON.parse(data); } catch { continue; }

        if ((chunk as any).usage) {
          usage = (chunk as any).usage;
        }
        if ((chunk as any).model) {
          model = (chunk as any).model;
        }

        const choices = (chunk as any).choices as Array<{
          delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
          finish_reason?: string;
        }> | undefined;

        if (!choices?.[0]) continue;
        const delta = choices[0].delta;
        if (choices[0].finish_reason) finishReason = choices[0].finish_reason;

        if (delta?.content) {
          content += delta.content;
          onDelta?.(delta.content);
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            let part = toolCallParts.get(tc.index);
            if (!part) {
              part = { id: tc.id ?? "", name: "", args: "" };
              toolCallParts.set(tc.index, part);
            }
            if (tc.id) part.id = tc.id;
            if (tc.function?.name) part.name += tc.function.name;
            if (tc.function?.arguments) part.args += tc.function.arguments;
          }
        }
      }
    }

    const toolCalls: ToolCall[] = [];
    for (const [, part] of [...toolCallParts.entries()].sort((a, b) => a[0] - b[0])) {
      toolCalls.push({
        id: part.id,
        type: "function",
        function: { name: part.name, arguments: part.args },
      });
    }

    const message: ChatMessage = {
      role: "assistant",
      content: content || null,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    };

    return { message, usage, model, finishReason };
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
