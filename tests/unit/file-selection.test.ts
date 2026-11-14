import { it, expect } from "vitest";
import {
  addFiles,
  toggleFile,
  selectedFiles,
  MAX_QUEUE_FILES,
} from "../../src/web/features/send/selection";
it("adds multiple files, keeps earlier choices and excludes unchecked files", () => {
  const a = new File(["a"], "a.txt"),
    b = new File(["b"], "b.txt"),
    c = new File(["c"], "c.txt");
  let queue = addFiles([], [a, b]).items;
  queue = toggleFile(queue, queue[1].id, false);
  queue = addFiles(queue, [c]).items;
  expect(selectedFiles(queue).map((f) => f.name)).toEqual(["a.txt", "c.txt"]);
  expect(queue).toHaveLength(3);
});
it("rejects invalid files without clearing valid queue and caps count", () => {
  const good = new File(["a"], "good.txt");
  let queue = addFiles([], [good]).items;
  const result = addFiles(queue, [new File([], "empty.txt")]);
  expect(result.items).toHaveLength(1);
  expect(result.errors).toHaveLength(1);
  queue = addFiles(
    [],
    Array.from(
      { length: MAX_QUEUE_FILES + 1 },
      (_, i) => new File(["a"], i + ".txt"),
    ),
  ).items;
  expect(queue).toHaveLength(MAX_QUEUE_FILES);
});
