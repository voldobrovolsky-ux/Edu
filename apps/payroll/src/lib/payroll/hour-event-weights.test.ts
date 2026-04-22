import { describe, expect, it } from "vitest";
import { addLessonRow, emptyWeights } from "./hour-event-weights";

describe("hour-event-weights", () => {
  it("applies pay factor and mrot boolean", () => {
    let w = emptyWeights();
    w = addLessonRow(w, 10, 1, true);
    expect(w).toEqual({ pay: 10, mrot: 10 });
    w = addLessonRow(emptyWeights(), 10, 0, true);
    expect(w).toEqual({ pay: 0, mrot: 10 });
    w = addLessonRow(emptyWeights(), 10, 0, false);
    expect(w).toEqual({ pay: 0, mrot: 0 });
  });
});
