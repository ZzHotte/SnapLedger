import { describe, expect, it } from "vitest";
import { detectCarrier, guessReferenceKind } from "./carriers";

describe("detectCarrier", () => {
  it("suggests a carrier from a container or B/L prefix, ignoring case and spaces", () => {
    expect(detectCarrier("msku 7342110")?.code).toBe("MSK");
    expect(detectCarrier("HLCUSHA2410ABC1")?.code).toBe("HPL");
    expect(detectCarrier("OOLU8821453")?.code).toBe("OOCL");
  });

  it("returns null for unknown or too-short prefixes rather than guessing", () => {
    expect(detectCarrier("XXXU1234567")).toBeNull();
    expect(detectCarrier("MS")).toBeNull();
  });
});

describe("guessReferenceKind", () => {
  it("recognises an ISO 6346 container number", () => {
    expect(guessReferenceKind("MSKU 7342110")).toBe("container");
  });

  it("treats other letter-prefixed numbers as a B/L and bare digits as a booking", () => {
    expect(guessReferenceKind("HLCUSHA2410ABC1")).toBe("bl");
    expect(guessReferenceKind("254819034")).toBe("booking");
  });
});
