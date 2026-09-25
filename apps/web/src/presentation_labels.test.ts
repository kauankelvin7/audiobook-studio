import { describe, expect, it } from "vitest";
import { displayRegionType } from "./presentation_labels";

describe("displayRegionType", () => {
  it("hides the internal unknown label from the user interface", () => {
    expect(displayRegionType("unknown")).toBe("Texto não classificado");
  });

  it("preserves known structural labels", () => {
    expect(displayRegionType("heading")).toBe("heading");
    expect(displayRegionType("code")).toBe("code");
  });
});
