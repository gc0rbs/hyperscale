import { describe, expect, it } from "vitest";
import { compact, formatEta, formatHash } from "../src/lib/format";

describe("format", () => {
  it("formats hash in millions", () => {
    expect(formatHash(7_000_000n * 10n ** 18n)).toBe("7.00M H");
    expect(compact(19_500_000)).toBe("19.50M");
    expect(compact(120_000)).toBe("120.00k");
  });
  it("formats ETAs as the brief specifies", () => {
    expect(formatEta(8 * 60)).toBe("8 min");
    expect(formatEta(3600 + 18 * 60)).toBe("1h 18m");
    expect(formatEta(2 * 86400 + 4 * 3600)).toBe("2d 4h");
    expect(formatEta(-1)).toBe("–");
  });
});
