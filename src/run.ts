/**
 * 一次任务的直线流程：
 *   取下一步 → 判断 message / tool_call → 校验参数 → 判断权限 → 执行 → 打印 → 结果回灌上下文
 * 循环只有这一处。没有事件链、订阅表、状态回报端口或装配根；
 * 工具与 Agent 都不持有 print / approve，取消就是循环里的一个 break。
 */
import type {
  ChatMessage,
  RunOptions,
  RunResult,
  RunStatus,
  ToolContext,
  ToolResult,
} from "./contracts.js";
import { validateInput } from "./tools.js";

export async function runTask(options: RunOptions): Promise<RunResult> {
  const { input, agent, systemPrompt, tools, workspace, approve, print } = options;
  const context: ToolContext = { workspace };
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: input },
  ];

  let status: RunStatus = "completed";
  let error: string | undefined;
  print("=== Run 开始 ===");

  try {
    while (true) {
      const reply = await agent(messages, tools);

      if (reply.kind === "done") break;

      if (reply.kind === "message") {
        print(reply.text);
        messages.push({ role: "assistant", content: reply.text });
        continue;
      }

      // 是工具调用：查定义、校验参数，再判断有没有权限
      // 权限判断只有下面这一处：read 免审批，其余档位都要 approve。
      // 三档 risk 在此只表现为两档行为，等价于 needsApproval = risk !== "read"。
      print(`[工具] 调用 ${reply.name} ...`);
      const tool = tools.find((t) => t.name === reply.name);
      let result: ToolResult;

      if (!tool) {
        result = { ok: false, text: `未知工具：${reply.name}` };
      } else {
        const invalid = validateInput(tool, reply.input);
        if (invalid) {
          result = { ok: false, text: invalid };
        } else if (tool.risk === "read") {
          result = await tool.run(reply.input, context);
        } else {
          const decision = await approve({
            name: reply.name,
            input: reply.input,
            risk: tool.risk,
          });
          if (decision === "cancel") {
            status = "cancelled";
            break;
          }
          result = decision === "allow"
            ? await tool.run(reply.input, context)
            : { ok: false, text: `用户拒绝了工具 ${reply.name} 的本次调用。` };
        }
      }

      // 结果回灌上下文，下一轮模型据此决定继续还是结束
      messages.push({ role: "tool", name: reply.name, content: result.text });
      print(`[工具] ${reply.name} ${result.ok ? "完成" : "未成功"}`);
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
  }

  print(`=== Run 结束：${status} ===`);
  return error ? { status, messages, error } : { status, messages };
}
