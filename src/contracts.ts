/**
 * 公共类型。本项目只对接 Pi SDK 的 `createAgentSession()`：模型循环归 Pi 的 AgentSession 所有。
 * 这里只描述「注入什么」以及本项目自己的工具 / 审批契约。
 * 注入项：model + streamFn（Pi 的模型配置，见 model.ts）、systemPrompt、tools，
 * 以及 approve / print 两个边界函数。没有自定义 Agent 接口或注册表：换模型不换 Agent。
 * 工具不认识模型、界面、审批或打印；run() 只返回 ToolResult。
 */
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentMessage, StreamFn } from "@earendil-works/pi-agent-core";

/* ---------- 工具 ---------- */

/**
 * 工具风险档位，由受信任代码标注，模型不能修改。
 * 只区分 read 与「非 read」：read 免审批，write / execute 走 approve。
 * 目前没有任何工具声明 execute，三档枚举实际只有两档行为。
 * execute 的差异化策略留到阶段 4 出现命令执行工具时再定义。
 */
export type ToolRisk = "read" | "write" | "execute";

export interface ToolContext {
  /** 固定的工作区目录；文件操作以此为根。 */
  workspace: string;
}

export interface ToolResult {
  ok: boolean;
  /** 供模型阅读的文字；拒绝、校验失败也是结果而非异常。 */
  text: string;
  data?: unknown;
}

/** 工具定义 = 给模型看的描述 + 纯执行函数。参数校验由 Pi 在调用前完成。 */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema（draft-07 子集），由 Pi 的 validateToolArguments 校验。 */
  inputSchema: Record<string, unknown>;
  risk: ToolRisk;
  run(input: unknown, context: ToolContext): Promise<ToolResult>;
}

/* ---------- 审批 ---------- */

export type ApprovalDecision = "allow" | "deny" | "cancel";

export interface ApprovalRequest {
  name: string;
  /** 工具的真实输入（已经过 Pi 校验）；界面必须原样展示，不能改写。 */
  input: unknown;
  /** 预留给阶段 3 的 GUI 审批卡片展示风险档位；终端审批未读取此字段。 */
  risk: ToolRisk;
}

/* ---------- 一次任务 ---------- */

export interface RunOptions {
  input: string;
  /** Pi 的模型配置（模型对象 + 流函数），见 model.ts；不是 Agent 注入点。 */
  model: Model<Api>;
  streamFn: StreamFn;
  systemPrompt: string;
  tools: ToolDefinition[];
  workspace: string;
  /** 两个边界函数只由 runTask 持有，工具与模型都不认识它们。 */
  approve(request: ApprovalRequest): Promise<ApprovalDecision>;
  print(text: string): void;
}

export type RunStatus = "completed" | "cancelled" | "failed";

export interface RunResult {
  status: RunStatus;
  /** 结束后的完整 Pi transcript，便于测试和阶段 5 的历史保存。 */
  messages: AgentMessage[];
  error?: string;
}
