/**
 * 一次任务的装配：本项目唯一创建 Pi 会话的地方，用 SDK 的 `createAgentSession()`。
 * 循环、参数校验、工具结果回灌、终止判据全部由 AgentSession 拥有，这里只做三件映射：
 *   1. ToolDefinition → SDK customTools（工具仍只返回 ToolResult，不认识界面）
 *   2. risk + approve → 内联扩展的 tool_call 钩子（read 免审批；cancel 用 block + terminate）
 *   3. AgentSessionEvent → print（唯一展示出口，集中在这里）
 * 不再 `new Agent(...)`：会话、资源加载、扩展、事件订阅都是 SDK 的标准二开入口。
 */
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolDefinition as PiToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  RunOptions,
  RunResult,
  RunStatus,
  ToolContext,
  ToolDefinition,
} from "./contracts.js";

/** 项目工具 → SDK 自定义工具。失败是给模型看的结果（isError），不是异常。 */
function toSdkTool(tool: ToolDefinition, context: ToolContext): PiToolDefinition {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as PiToolDefinition["parameters"],
    // 审批是交互式的，一次只处理一个工具调用，避免同时弹出多个确认。
    executionMode: "sequential",
    async execute(_toolCallId, input) {
      const result = await tool.run(input, context);
      return {
        content: [{ type: "text", text: result.text }],
        details: { tool: tool.name, ok: result.ok },
        isError: !result.ok,
      };
    },
  };
}

/** 从 assistant 消息里取出给终端看的文字；阶段 1 不处理流式增量。 */
function assistantText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } =>
      typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

export async function runTask(options: RunOptions): Promise<RunResult> {
  const { input, model, streamFn, systemPrompt, tools, workspace, approve, print } = options;
  const context: ToolContext = { workspace };
  let cancelled = false;
  let messages: AgentMessage[] = [];
  let error: string | undefined;
  print("=== Run 开始 ===");

  try {
    const settingsManager = SettingsManager.inMemory();
    const resourceLoader = new DefaultResourceLoader({
      cwd: workspace,
      agentDir: getAgentDir(),
      settingsManager,
      // 阶段 1 只做 CLI 演示，不读项目里的 AGENTS.md / 技能 / 扩展文件。
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt,
      // 审批是 SDK 扩展的标准拦截点：tool_call 事件可以 block 并给出原因。
      extensionFactories: [
        (pi) => {
          pi.on("tool_call", async (event) => {
            const tool = tools.find((t) => t.name === event.toolName);
            // 权限判断只有这一处：read 免审批，其余档位询问；三档 risk 实际只表现为两档行为。
            if (!tool || tool.risk === "read") return undefined;
            const decision = await approve({
              name: event.toolName,
              input: event.input,
              risk: tool.risk,
            });
            if (decision === "allow") return undefined;
            if (decision === "deny") {
              return { block: true, reason: `用户拒绝了工具 ${event.toolName} 的本次调用。` };
            }
            // cancel：阻止执行并让 Pi 在本批次后结束循环，无需自己维护 abort 状态。
            cancelled = true;
            return { block: true, reason: "用户取消了任务。", terminate: true };
          });
        },
      ],
    });
    await resourceLoader.reload();

    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    if (model.provider === "faux") {
      // faux 是 Pi 自带的离线演示 provider，SDK 默认只收录真实 provider。
      // 注册为带占位 key 的自定义 provider，让 session.prompt() 的鉴权预检通过；
      // 真正的响应来自注入的 streamFn，不会发出任何网络请求。
      modelRuntime.registerProvider("faux", { name: "Faux", apiKey: "demo-key" });
    }

    const { session } = await createAgentSession({
      cwd: workspace,
      modelRuntime,
      resourceLoader,
      settingsManager,
      sessionManager: SessionManager.inMemory(workspace),
      model,
      // 只启用注入的工具，关掉 SDK 自带的 read / bash / edit / write。
      tools: tools.map((tool) => tool.name),
      customTools: tools.map((tool) => toSdkTool(tool, context)),
    });

    try {
      // SDK 默认让 modelRuntime 走真实 provider；这里换成注入的 Pi AI 流函数。
      session.agent.streamFunction = streamFn;
      session.agent.toolExecution = "sequential";

      const unsubscribe = session.subscribe((event) => {
        if (event.type === "message_end" && event.message.role === "assistant") {
          const text = assistantText(event.message.content);
          if (text) print(text);
          return;
        }
        if (event.type === "tool_execution_start") {
          print(`[工具] 调用 ${event.toolName} ...`);
          return;
        }
        if (event.type === "tool_execution_end") {
          print(`[工具] ${event.toolName} ${event.isError ? "未成功" : "完成"}`);
        }
      });

      try {
        await session.prompt(input);
      } finally {
        unsubscribe();
      }
      messages = session.messages;
      error = session.agent.state.errorMessage ?? undefined;
    } finally {
      session.dispose();
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const status: RunStatus = cancelled ? "cancelled" : error ? "failed" : "completed";
  print(`=== Run 结束：${status} ===`);
  return error ? { status, messages, error } : { status, messages };
}
