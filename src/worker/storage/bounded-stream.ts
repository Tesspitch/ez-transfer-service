export function boundedStream(
  source: ReadableStream<Uint8Array>,
  expected: number,
): ReadableStream<Uint8Array> {
  let count = 0;
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        count += chunk.byteLength;
        if (count > expected) throw new Error("SIZE_MISMATCH");
        controller.enqueue(chunk);
      },
      flush() {
        if (count !== expected) throw new Error("SIZE_MISMATCH");
      },
    }),
  );
}
