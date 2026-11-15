import { describe, expect, it } from "vitest";
import { getAgent, registerAgent } from "../src/agents.js";
import type {
  Agent,
  ApprovalDecision,
  ApprovalRequest,
  ModelReply,
  RunOptions,
  RunResult,
  ToolDefinition,
} from "../src/contracts.js";
import { runTask } from "../src/run.js";

/** 按队列返回下一步，队列耗尽即结束。注入函数让测试不需要造任何假类。 */
function scripted(replies: ModelReply[]): Agent {
  return () => replies.shift() ?? { kind: "done" };
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

interface Harness {
  result: RunResult;
  lines: string[];
  approvals: ApprovalRequest[];
  executed: () => number;
}

async function runWith(opts: {
  replies?: ModelReply[];
  tools?: ToolDefinition[];
  agent?: Agent;
  decision?: ApprovalDecision;
}): Promise<Harness> {
  const lines: string[] = [];
  const approvals: ApprovalRequest[] = [];
  let executed = 0;
  const replies = opts.replies ?? [
    { kind: "message", text: "开场" },
    { kind: "tool_call", name: "demo.confirm", input: { text: "hi" } },
    { kind: "message", text: "收尾" },
    { kind: "done" },
  ];
  const options: RunOptions = {
    input: "你好",
    agent: opts.agent ?? scripted(replies),
    systemPrompt: "测试用系统提示",
    tools: opts.tools ?? [makeTool("write", () => { executed += 1; })],
    workspace: process.cwd(),
    approve: async (request) => {
      approvals.push(request);
      return opts.decision ?? "allow";
    },
    print: (text) => lines.push(text),
  };
  const result = await runTask(options);
  return { result, lines, approvals, executed: () => executed };
}

describe("直线循环", () => {
  it("允许：工具执行，结果回灌上下文，Run 以 completed 结束", async () => {
    const h = await runWith({});
    expect(h.result.status).toBe("completed");
    expect(h.executed()).toBe(1);
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0]).toMatchObject({ name: "demo.confirm", input: { text: "hi" } });
    expect(h.result.messages.some((m) => m.role === "tool" && m.content.includes("executed"))).toBe(true);
    expect(h.lines.at(-1)).toBe("=== Run 结束：completed ===");
  });

  it("拒绝：工具不执行，拒绝原因仍进入上下文", async () => {
    const h = await runWith({ decision: "deny" });
    expect(h.result.status).toBe("completed");
    expect(h.executed()).toBe(0);
    expect(h.result.messages.some((m) => m.role === "tool" && m.content.includes("拒绝"))).toBe(true);
  });

  it("取消：循环立即结束，不回灌工具结果，Run 以 cancelled 结束", async () => {
    const h = await runWith({ decision: "cancel" });
    expect(h.result.status).toBe("cancelled");
    expect(h.executed()).toBe(0);
    expect(h.result.messages.some((m) => m.role === "tool")).toBe(false);
    expect(h.lines.at(-1)).toBe("=== Run 结束：cancelled ===");
  });

  it("read 工具直接执行，不发起审批", async () => {
    const h = await runWith({ tools: [makeTool("read", () => {})] });
    expect(h.approvals).toHaveLength(0);
    expect(h.result.status).toBe("completed");
  });

  it("未知工具返回失败结果而非抛错", async () => {
    const h = await runWith({
      replies: [
        { kind: "tool_call", name: "no.such", input: {} },
        { kind: "done" },
      ],
    });
    expect(h.result.status).toBe("completed");
    expect(h.approvals).toHaveLength(0);
    expect(h.result.messages.some((m) => m.role === "tool" && m.content.includes("未知工具"))).toBe(true);
  });

  it("参数不符合 Schema 时拒绝执行且不发起审批", async () => {
    const h = await runWith({
      replies: [
        { kind: "tool_call", name: "demo.confirm", input: { text: "" } },
        { kind: "done" },
      ],
    });
    expect(h.approvals).toHaveLength(0);
    expect(h.result.messages.some((m) => m.role === "tool" && m.content.includes("参数校验失败"))).toBe(true);
  });

  it("Agent 抛错：Run 以 failed 结束并带错误信息", async () => {
    const h = await runWith({ agent: () => { throw new Error("模型不可用"); } });
    expect(h.result.status).toBe("failed");
    expect(h.result.error).toBe("模型不可用");
  });

  it("注册的 Mock Agent 能走完 文字 → 工具 → 汇报 → done", async () => {
    const lines: string[] = [];
    const result = await runTask({
      input: "你好",
      agent: getAgent("mock"),
      systemPrompt: "测试用系统提示",
      tools: [demoConfirmForTest()],
      workspace: process.cwd(),
      approve: async () => "allow",
      print: (text) => lines.push(text),
    });
    expect(result.status).toBe("completed");
    expect(lines).toContain("收到任务，我将调用演示工具处理。");
    expect(lines.some((line) => line.startsWith("演示结果："))).toBe(true);
    expect(result.messages.filter((m) => m.role === "assistant")).toHaveLength(2);
  });
});

describe("Agent 注册", () => {
  it("重复 id 报错，未注册 id 报错", () => {
    expect(() => registerAgent("mock", () => ({ kind: "done" }))).toThrow(/重复注册/);
    expect(() => getAgent("nope")).toThrow(/未注册/);
  });
});

function demoConfirmForTest(): ToolDefinition {
  return makeTool("write");
}
