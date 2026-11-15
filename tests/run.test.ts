/**
 * 系统只有 Pi 一个 Agent（SDK 的 createAgentSession）。
 * 用上游 faux provider 脚本化模型回复，不需要 API Key；
 * 每个用例新建一份模型配置，避免脚本响应互相消耗。
 */
import {
  fauxAssistantMessage,
  fauxText,
  fauxToolCall,
  type FauxResponseStep,
} from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import type {
  ApprovalDecision,
  ApprovalRequest,
  RunResult,
  ToolDefinition,
} from "../src/contracts.js";
import { createDemoModel } from "../src/model.js";
import { runTask } from "../src/run.js";

/** 一轮工具调用 + 一轮纯文字收尾；Pi 在没有 toolCall 时自然结束。 */
function toolTurn(name = "demo.confirm", input: Record<string, string> = { text: "hi" }): FauxResponseStep[] {
  return [
    fauxAssistantMessage([fauxText("开场"), fauxToolCall(name, input)], {
      stopReason: "toolUse",
    }),
    fauxAssistantMessage("收尾"),
  ];
}

function makeTool(risk: ToolDefinition["risk"], onRun?: () => void): ToolDefinition {
  return {
    name: "demo.confirm",
    description: "测试用工具",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", minLength: 1 } },
      required: ["text"],
      additionalProperties: false,
    },
    risk,
    run: async (input) => {
      onRun?.();
      return { ok: true, text: `executed:${JSON.stringify(input)}` };
    },
  };
}

/** Pi 的 toolResult.content 是内容块数组，取出给模型看的文字。 */
function toolResultText(result: RunResult): string {
  return result.messages
    .filter((m) => m.role === "toolResult")
    .flatMap((m) => m.content.map((block) => (block.type === "text" ? block.text : "")))
    .join("\n");
}

interface Harness {
  result: RunResult;
  lines: string[];
  approvals: ApprovalRequest[];
  executed: () => number;
}

async function runWith(opts: {
  responses?: FauxResponseStep[];
  tools?: ToolDefinition[];
  decision?: ApprovalDecision;
}): Promise<Harness> {
  const lines: string[] = [];
  const approvals: ApprovalRequest[] = [];
  let executed = 0;
  const result = await runTask({
    input: "你好",
    ...createDemoModel(opts.responses ?? toolTurn()),
    systemPrompt: "测试用系统提示",
    tools: opts.tools ?? [makeTool("write", () => { executed += 1; })],
    workspace: process.cwd(),
    approve: async (request) => {
      approvals.push(request);
      return opts.decision ?? "allow";
    },
    print: (text) => lines.push(text),
  });
  return { result, lines, approvals, executed: () => executed };
}

describe("Pi AgentSession 循环", () => {
  it("允许：工具执行，结果回灌 transcript，Run 以 completed 结束", async () => {
    const h = await runWith({});
    expect(h.result.status).toBe("completed");
    expect(h.executed()).toBe(1);
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0]).toMatchObject({ name: "demo.confirm", input: { text: "hi" } });
    expect(toolResultText(h.result)).toContain("executed");
    expect(h.lines).toContain("开场");
    expect(h.lines).toContain("收尾");
    expect(h.lines.at(-1)).toBe("=== Run 结束：completed ===");
  });

  it("拒绝：工具不执行，拒绝原因作为 toolResult 进入上下文", async () => {
    const h = await runWith({ decision: "deny" });
    expect(h.result.status).toBe("completed");
    expect(h.executed()).toBe(0);
    expect(toolResultText(h.result)).toContain("用户拒绝");
  });

  it("取消：工具不执行，Run 以 cancelled 结束", async () => {
    const h = await runWith({ decision: "cancel" });
    expect(h.result.status).toBe("cancelled");
    expect(h.executed()).toBe(0);
    expect(toolResultText(h.result)).toContain("用户取消了任务");
    expect(h.lines.at(-1)).toBe("=== Run 结束：cancelled ===");
  });

  it("read 工具直接执行，不发起审批", async () => {
    const h = await runWith({ tools: [makeTool("read", () => {})] });
    expect(h.approvals).toHaveLength(0);
    expect(h.result.status).toBe("completed");
  });

  it("未知工具由 Pi 生成失败结果，不抛错也不审批", async () => {
    const h = await runWith({ responses: toolTurn("no.such", {}) });
    expect(h.result.status).toBe("completed");
    expect(h.approvals).toHaveLength(0);
    expect(toolResultText(h.result)).toContain("not found");
  });

  it("参数不符合 Schema 时由 Pi 校验拦截，不执行也不审批", async () => {
    const h = await runWith({ responses: toolTurn("demo.confirm", { text: "" }) });
    expect(h.executed()).toBe(0);
    expect(h.approvals).toHaveLength(0);
    expect(toolResultText(h.result)).toContain("Validation failed");
  });

  it("模型返回错误：Run 以 failed 结束并带错误信息", async () => {
    const h = await runWith({
      responses: [fauxAssistantMessage("", { stopReason: "error", errorMessage: "模型不可用" })],
    });
    expect(h.result.status).toBe("failed");
    expect(h.result.error).toBe("模型不可用");
  });

  it("默认演示脚本能走完 文字 → 工具 → 汇报", async () => {
    const lines: string[] = [];
    const result = await runTask({
      input: "你好",
      ...createDemoModel(),
      systemPrompt: "测试用系统提示",
      tools: [makeTool("write")],
      workspace: process.cwd(),
      approve: async () => "allow",
      print: (text) => lines.push(text),
    });
    expect(result.status).toBe("completed");
    expect(lines).toContain("收到任务，我将调用演示工具处理。");
    expect(result.messages.filter((m) => m.role === "assistant")).toHaveLength(2);
    expect(result.messages.some((m) => m.role === "toolResult")).toBe(true);
  });
});
