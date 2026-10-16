import { describe, expect, it } from "vitest";
import { apiHistory, chatCartNote, mergeInflight } from "./thread.js";

describe("история чата", () => {
  it("после обновления страницы помнит текст файла, а служебные пузыри не отправляет", () => {
    const history = apiHistory([
      { role: "user", text: "", context: "[фото: look.jpg]\n\n[Файл «brief.pdf»]\nткань бордо" },
      { role: "bot", text: "…", pending: true },
      { role: "bot", text: "Не успела ответить.", local: true },
      { role: "bot", text: "Беру бордо.", context: "Беру бордо." },
    ]);
    expect(history).toEqual([
      { role: "user", content: "[фото: look.jpg]\n\n[Файл «brief.pdf»]\nткань бордо" },
      { role: "assistant", content: "Беру бордо." },
    ]);
  });

  it("сообщение второй вкладки не затирает первую", () => {
    const first = { id: "u1", role: "user", text: "бордо" };
    const pending = { id: "p1", role: "bot", text: "…", pending: true };
    const other = { id: "u2", role: "user", text: "синий" };
    const merged = mergeInflight([other], { user: first, pending, bot: null });
    expect(merged.map((item) => item.id)).toEqual(["u2", "u1", "p1"]);
    const done = mergeInflight(merged, {
      user: first,
      pending,
      bot: { id: "b1", role: "bot", text: "положила" },
    });
    expect(done.map((item) => item.text)).toEqual(["синий", "бордо", "положила"]);
  });

  it("пишет, какие позиции не попали в корзину", () => {
    expect(chatCartNote(["Қалта"])).toContain("Қалта");
    expect(chatCartNote([])).toBe("");
  });
});
