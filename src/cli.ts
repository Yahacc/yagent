/**
 * 学习用 CLI：注入「模型 / prompt / 工具」，并提供 approve 与 print 两个边界函数。
 * 业务逻辑全在 run.ts 的直线循环里，这里只做终端 I/O。
 *
 * 运行：pnpm cli <任务文字>，审批时输入 y（允许）/ n（拒绝）/ c（取消任务）。
 */
import { createInterface } from "node:readline/promises";
import { getAgent } from "./agents.js";
import type { ApprovalDecision, ApprovalRequest } from "./contracts.js";
import { runTask } from "./run.js";
import { builtinTools } from "./tools.js";

/** prompt 注入；阶段 2 可换成模板注册表，循环不用改。 */
const systemPrompt = "你是在固定工作区内协助完成编程任务的助手。";

/** 审批界面：自己展示真实参数并返回决定；不持有任何任务句柄。EOF 视为拒绝。 */
async function approve(request: ApprovalRequest): Promise<ApprovalDecision> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`\n[审批] 工具 ${request.name} 请求执行：`);
    console.log(`  参数：${JSON.stringify(request.input)}`);
    const answer = (
      await rl.question("  允许一次？(y=允许 / n=拒绝 / c=取消任务) ")
    ).trim().toLowerCase();
    return answer === "y" ? "allow" : answer === "c" ? "cancel" : "deny";
  } catch {
    return "deny";
  } finally {
    rl.close();
  }
}

/** 打印只有一个出口：拿到字符串就输出，不解析事件类型。 */
const print = (text: string): void => console.log(text);

async function main(): Promise<void> {
  const input = process.argv.slice(2).join(" ").trim();
  if (!input) {
    console.error("用法：pnpm cli <任务文字>");
    process.exitCode = 1;
    return;
  }

  const result = await runTask({
    input,
    agent: getAgent("mock"),
    systemPrompt,
    tools: builtinTools,
    workspace: process.cwd(),
    approve,
    print,
  });
  console.log(`Run 记录：${JSON.stringify({ status: result.status }, null, 2)}`);
}

void main().catch((err) => {
  console.error("CLI 异常退出：", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
