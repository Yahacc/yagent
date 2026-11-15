/**
 * Agent 注册：相比直接调用 LLM API，这里只多了一张 id → 实现 的注册表。
 * 换引擎（阶段 2 接 Pi）只改这张表，循环、工具和边界 I/O 都不动。
 */
import type { Agent, ChatMessage, ModelReply } from "./contracts.js";

/**
 * 阶段 1 的脚本化 Agent：不接网络、不需要 API Key。
 * 按上下文推导下一步——发文字 → 调 demo.confirm → 汇报结果 → done。
 * 阶段 1 不消费 tools 参数；签名保留以便阶段 2 换成真实 Agent 时不用改循环。
 */
const mockAgent: Agent = (messages: ChatMessage[]): ModelReply => {
  const userText = messages.find((m) => m.role === "user")?.content ?? "";
  const hasToolResult = messages.some((m) => m.role === "tool");
  const last = messages.at(-1);

  if (!hasToolResult) {
    if (last?.role === "user") {
      return { kind: "message", text: "收到任务，我将调用演示工具处理。" };
    }
    return { kind: "tool_call", name: "demo.confirm", input: { text: userText } };
  }
  if (last?.role === "tool") {
    return { kind: "message", text: `演示结果：${last.content}` };
  }
  return { kind: "done" };
};

const agents = new Map<string, Agent>([["mock", mockAgent]]);

/** 按 id 取出已注册的 Agent；未注册直接报错，不静默回退。 */
export function getAgent(id: string): Agent {
  const agent = agents.get(id);
  if (!agent) throw new Error(`未注册 Agent：${id}`);
  return agent;
}

/** 供阶段 2 注册 Pi Adapter；重复 id 报错，避免静默替换实现。 */
export function registerAgent(id: string, agent: Agent): void {
  if (agents.has(id)) throw new Error(`Agent ID 重复注册：${id}`);
  agents.set(id, agent);
}
