import type { AssistantMessage } from "@earendil-works/pi-ai";

/**
 * Characters that read as a natural sentence end. A message whose last visible
 * character is one of these does not look cut off.
 */
const SENTENCE_FINAL_CHARS = new Set(
	[
		// CJK and fullwidth punctuation
		"。．！？；：，、…～",
		// ASCII punctuation
		".!?;:,~)",
		// Closing quotes, brackets, and backticks
		"”’」』】》〉〕》\"'`",
	].join(""),
);

/**
 * Minimum visible-text length before an abrupt ending counts as a truncation
 * signal. Short replies like "ok" or "done" end without punctuation all the
 * time and would flood the notice otherwise.
 */
const MIN_VISIBLE_TEXT_LENGTH = 40;

/**
 * Detect responses that a provider reported as complete (`stopReason: "stop"`)
 * but whose visible text ends abruptly, such as mid-sentence or at the end of
 * an open list item.
 *
 * "length", "error", and "aborted" stops have dedicated handling elsewhere;
 * this only covers the case where the provider cut the stream and still
 * reported a normal stop, which otherwise renders as a complete reply with no
 * indication to the user.
 */
export function looksTruncated(message: AssistantMessage): boolean {
	if (message.stopReason !== "stop") return false;
	if (message.content.some((c) => c.type === "toolCall")) return false;

	let lastText: string | undefined;
	let visibleLength = 0;
	for (const content of message.content) {
		if (content.type === "text" && content.text.trim().length > 0) {
			lastText = content.text;
			visibleLength += content.text.trim().length;
		}
	}
	if (lastText === undefined || visibleLength < MIN_VISIBLE_TEXT_LENGTH) return false;

	// Completed replies usually end with a trailing newline.
	if (lastText.endsWith("\n")) return false;

	const tail = lastText.trimEnd();
	if (tail.length === 0) return false;

	// Completed code fences, JSON objects, and arrays end with a closing delimiter.
	if (tail.endsWith("```") || tail.endsWith("}") || tail.endsWith("]")) return false;

	const lastChar = [...tail].at(-1);
	return lastChar === undefined || !SENTENCE_FINAL_CHARS.has(lastChar);
}
