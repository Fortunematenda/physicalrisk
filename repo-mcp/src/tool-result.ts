/**
 * ChatGPT connectors require structuredContent to be a JSON object (not an array).
 */
export function toolResult(data: unknown) {
  const payload =
    data && typeof data === 'object' && !Array.isArray(data) && 'result' in (data as object)
      ? (data as { result: unknown }).result
      : data;
  const structured =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : { items: payload };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
    structuredContent: structured,
  };
}
