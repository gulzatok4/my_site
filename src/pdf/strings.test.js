import { describe, expect, it } from "vitest";
import { formatInvoiceDate, invoiceHeading } from "./strings.js";

describe("formatInvoiceDate", () => {
  it("берёт календарную дату из строки, не из пояса браузера", () => {
    expect(formatInvoiceDate("2026-10-13T00:30:00.0000000+05:00")).toBe("13 октября 2026 г.");
    expect(formatInvoiceDate("2026-01-01T23:30:00+05:00")).toBe("1 января 2026 г.");
  });

  it("собирает заголовок счёта", () => {
    expect(invoiceHeading(12, "2026-10-13T22:48:00+05:00")).toBe("Счёт на оплату № 12 от 13 октября 2026 г.");
  });
});
