/** Ambient types so the IDE resolves vitest when workspace deps are only installed in Docker. */
declare module 'vitest' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): {
    toEqual(expected: unknown): void;
    toBe(expected: unknown): void;
    toContain(expected: unknown): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    not: {
      toContain(expected: unknown): void;
      toBe(expected: unknown): void;
    };
  };
}
