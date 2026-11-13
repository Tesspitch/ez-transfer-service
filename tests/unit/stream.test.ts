import { expect, it } from "vitest";
import { boundedStream } from "../../src/worker/storage/bounded-stream";
const stream = (values: number[][]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const a of values) c.enqueue(new Uint8Array(a));
      c.close();
    },
  });
it("streams exact sizes and rejects excess or truncated content", async () => {
  expect([
    ...new Uint8Array(
      await new Response(boundedStream(stream([[1], [2, 3]]), 3)).arrayBuffer(),
    ),
  ]).toEqual([1, 2, 3]);
  await expect(
    new Response(
      boundedStream(
        stream([
          [1, 2],
          [3, 4],
        ]),
        3,
      ),
    ).arrayBuffer(),
  ).rejects.toThrow();
  await expect(
    new Response(boundedStream(stream([[1]]), 3)).arrayBuffer(),
  ).rejects.toThrow();
});
