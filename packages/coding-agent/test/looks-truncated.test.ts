import type { AssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, test } from "vitest";
import { looksTruncated } from "../src/utils/looks-truncated.ts";

function createAssistantMessage(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-completions",
		provider: "deepseek",
		model: "deepseek-flash",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: Date.now(),
	};
}

// Tail copied from a real session where the provider cut the stream mid-list
// and still reported stopReason "stop".
const CUT_OFF_LIST =
	"4. **Reflection 真实 lint/test 反馈**\n   - 目前 reviewer 仍主要是 LLM 评分\n   - 应把 lint/test 退出码作为一等通过条件";

describe("looksTruncated", () => {
	// #11210
	test("flags a reply that ends mid-list without a trailing newline", () => {
		expect(looksTruncated(createAssistantMessage([{ type: "text", text: CUT_OFF_LIST }]))).toBe(true);
	});

	test("flags a reply that ends mid-sentence in ASCII", () => {
		expect(
			looksTruncated(
				createAssistantMessage([
					{ type: "text", text: "This is a long reply that ends without any punctuation and just stops" },
				]),
			),
		).toBe(true);
	});

	test("ignores replies that end with a trailing newline", () => {
		expect(looksTruncated(createAssistantMessage([{ type: "text", text: `${CUT_OFF_LIST}\n` }]))).toBe(false);
	});

	test("ignores replies that end with sentence-final punctuation", () => {
		for (const ending of ["。", ".", "!", "?", "…", ")", "”"]) {
			expect(
				looksTruncated(createAssistantMessage([{ type: "text", text: `${CUT_OFF_LIST}${ending}` }])),
				`ending ${ending}`,
			).toBe(false);
		}
	});

	test("ignores short replies", () => {
		expect(looksTruncated(createAssistantMessage([{ type: "text", text: "ok" }]))).toBe(false);
	});

	test("ignores completed code fences and JSON", () => {
		expect(looksTruncated(createAssistantMessage([{ type: "text", text: "```\nconsole.log(1)\n```" }]))).toBe(false);
		expect(looksTruncated(createAssistantMessage([{ type: "text", text: '{"a": 1}' }]))).toBe(false);
	});

	test("ignores messages without visible text", () => {
		expect(looksTruncated(createAssistantMessage([]))).toBe(false);
		expect(looksTruncated(createAssistantMessage([{ type: "thinking", thinking: "cut off" }]))).toBe(false);
	});

	test("ignores non-stop stop reasons, which have dedicated handling", () => {
		for (const stopReason of ["length", "error", "aborted"] as const) {
			expect(
				looksTruncated(createAssistantMessage([{ type: "text", text: CUT_OFF_LIST }], stopReason)),
				`stopReason ${stopReason}`,
			).toBe(false);
		}
	});

	test("ignores messages with tool calls", () => {
		expect(
			looksTruncated(
				createAssistantMessage([
					{ type: "text", text: CUT_OFF_LIST },
					{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "file.txt" } },
				]),
			),
		).toBe(false);
	});
});
