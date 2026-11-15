/**
 * 公共类型。没有端口接口、事件总线或订阅表：
 * 一次任务就是注入「模型 / prompt / 工具 / 边界 I/O」，然后走一条直线循环。
 * 本文件不 import 任何实现。
 */

/* ---------- 工具 ---------- */

/**
 * 工具风险档位，由受信任代码标注。
 * 阶段 1 的循环只区分 read 与「非 read」：read 免审批，write / execute 都要审批；
 * 目前没有任何工具声明 execute，三档枚举实际只有两档行为。
 * execute 的差异化策略留到阶段 4 出现命令执行工具时再定义，见阶段 1 说明。
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

/**
 * 工具定义 = 给模型看的描述 + 纯执行函数。
 * run() 只返回结果，不认识模型、界面、审批或打印。
 */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema（draft-07 子集），调用前由 Ajv 校验。 */
  inputSchema: Record<string, unknown>;
  /** 模型不能修改；阶段 1 只用于 run.ts 判断是否免审批。 */
  risk: ToolRisk;
  run(input: unknown, context: ToolContext): Promise<ToolResult>;
}

/* ---------- 模型 / Agent ---------- */

/** 发给模型的上下文，与常见 LLM API 的 messages 同形。 */
export type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "tool"; name: string; content: string };

/** 模型一次返回的下一步：文字、工具调用，或本次任务结束。 */
export type ModelReply =
  | { kind: "message"; text: string }
  | { kind: "tool_call"; name: string; input: unknown }
  | { kind: "done" };

/**
 * 模型/Agent 的唯一接口：给上下文和工具清单，返回下一步。
 * 阶段 1 用 Mock；阶段 2 换 Pi 只替换这个函数的实现，不改循环、工具和 I/O。
 */
export type Agent = (
  messages: ChatMessage[],
  tools: ToolDefinition[],
) => ModelReply | Promise<ModelReply>;

/* ---------- 一次任务 ---------- */

export type ApprovalDecision = "allow" | "deny" | "cancel";

export interface ApprovalRequest {
  name: string;
  /** 工具的真实输入；界面必须原样展示，不能改写。 */
  input: unknown;
  /** 预留给阶段 3 的 GUI 审批卡片展示风险档位；阶段 1 的终端审批未读取此字段。 */
  risk: ToolRisk;
}

export interface RunOptions {
  input: string;
  /** 三项注入：模型（Agent）、prompt、工具清单。 */
  agent: Agent;
  systemPrompt: string;
  tools: ToolDefinition[];
  workspace: string;
  /** 两项边界 I/O，只有循环持有；工具与 Agent 都不认识它们。 */
  approve(request: ApprovalRequest): Promise<ApprovalDecision>;
  print(text: string): void;
}

export type RunStatus = "completed" | "cancelled" | "failed";

export interface RunResult {
  status: RunStatus;
  /** 结束后的完整上下文，便于测试和阶段 5 的历史保存。 */
  messages: ChatMessage[];
  error?: string;
}
