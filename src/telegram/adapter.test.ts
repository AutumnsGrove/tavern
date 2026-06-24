import { describe, it, expect } from "vitest";
import { paginate } from "./adapter";

describe("TelegramAdapter", () => {
  describe("paginate", () => {
    it("returns single page for short text", () => {
      const pages = paginate("Hello world");
      expect(pages).toEqual(["Hello world"]);
    });

    it("splits at paragraph boundary", () => {
      const first = "A".repeat(3000);
      const second = "B".repeat(3000);
      const text = `${first}\n\n${second}`;

      const pages = paginate(text);
      expect(pages).toHaveLength(2);
      expect(pages[0]).toBe(first);
      expect(pages[1]).toBe(second);
    });

    it("splits at newline when no paragraph break", () => {
      const first = "A".repeat(3000);
      const second = "B".repeat(2000);
      const text = `${first}\n${second}`;

      const pages = paginate(text);
      expect(pages).toHaveLength(2);
      expect(pages[0]).toBe(first);
      expect(pages[1]).toBe(second);
    });

    it("handles text exactly at limit", () => {
      const text = "X".repeat(4096);
      const pages = paginate(text);
      expect(pages).toEqual([text]);
    });

    it("handles very long text with multiple splits", () => {
      const chunk = "Word ".repeat(900); // ~4500 chars
      const text = `${chunk}\n\n${chunk}\n\n${chunk}`;
      const pages = paginate(text);
      expect(pages.length).toBeGreaterThanOrEqual(3);
      for (const page of pages) {
        expect(page.length).toBeLessThanOrEqual(4096);
      }
    });
  });
});
