import { describe, expect, it } from "vitest";
import { amountInWords } from "./amountInWords.js";

describe("amountInWords", () => {
  const tenge = {
    0: "Ноль тенге 00 тиын",
    1: "Один тенге 00 тиын",
    2: "Два тенге 00 тиын",
    5: "Пять тенге 00 тиын",
    11: "Одиннадцать тенге 00 тиын",
    19: "Девятнадцать тенге 00 тиын",
    21: "Двадцать один тенге 00 тиын",
    101: "Сто один тенге 00 тиын",
    1000: "Одна тысяча тенге 00 тиын",
    2000: "Две тысячи тенге 00 тиын",
    5000: "Пять тысяч тенге 00 тиын",
    21000: "Двадцать одна тысяча тенге 00 тиын",
    65000: "Шестьдесят пять тысяч тенге 00 тиын",
    1000000: "Один миллион тенге 00 тиын",
  };

  for (const [amount, text] of Object.entries(tenge)) {
    it(String(amount), () => {
      expect(amountInWords(Number(amount))).toBe(text);
    });
  }

  it("1 234 567,89", () => {
    expect(amountInWords(1234567.89)).toBe(
      "Один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь тенге 89 тиын"
    );
  });

  it("склоняет рубли и копейки", () => {
    expect(amountInWords(1, "rub")).toBe("Один рубль 00 копеек");
    expect(amountInWords(2, "rub")).toBe("Два рубля 00 копеек");
    expect(amountInWords(5, "rub")).toBe("Пять рублей 00 копеек");
    expect(amountInWords(11.01, "rub")).toBe("Одиннадцать рублей 01 копейка");
    expect(amountInWords(21.02, "rub")).toBe("Двадцать один рубль 02 копейки");
  });

  it("склоняет доллары и центы", () => {
    expect(amountInWords(1, "usd")).toBe("Один доллар 00 центов");
    expect(amountInWords(2, "usd")).toBe("Два доллара 00 центов");
    expect(amountInWords(5.05, "usd")).toBe("Пять долларов 05 центов");
  });
});
