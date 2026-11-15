/**
 * 学习用 CLI：注入「Pi 模型 / prompt / 工具」，并提供 approve 与 print 两个终端边界。
 * 循环归 SDK 的 createAgentSession()（run.ts 是唯一调用点），这里只做终端 I/O：
 * 读任务文字、共用一条 readline 问审批、把 runTask 的文本与终态原样输出。
 *
 * 运行：pnpm cli <任务文字>，审批时输入 y（允许）/ n（拒绝）/ c（取消任务）。
 * 默认用 Pi 自带的 faux provider 演示（无需 Key）；设置 YAGENT_MODEL 并提供
 * OPENAI_API_KEY 时走真实模型——两者都只是 Pi 的模型来源，Agent 始终不变。
 */
import { createInterface } from "node:readline/promises";
import type { ApprovalDecision, ApprovalRequest } from "./contracts.js";
import { createPiModel } from "./model.js";
import { runTask } from "./run.js";
import { builtinTools } from "./tools.js";

/** prompt 注入；后续阶段可换成模板注册表，循环不用改。 */
const systemPrompt = "你是在固定工作区内协助完成编程任务的助手。";

/** 正常输出只有一个出口：拿到字符串就输出，不解析事件类型；错误另走 stderr。 */
const print = (text: string): void => console.log(text);

const usage = "用法：pnpm cli <任务文字>（审批输入 y=允许 / n=拒绝 / c=取消任务）";

async function main(): Promise<void> {
  const input = process.argv.slice(2).join(" ").trim();
  if (input === "-h" || input === "--help") {
    print(usage);
    return;
  }
  if (!input) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  // 显式列出模型注入的两个字段，不用展开把 PiModel 的结构藏起来。
  const { model, streamFn } = createPiModel();
  // 一次任务共用一条 readline：审批可能被调用多次，不必每次新建再关闭 stdin。
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    /** 审批界面：展示真实参数并返回决定；不持有任何任务句柄。EOF 视为拒绝。 */
    const approve = async (request: ApprovalRequest): Promise<ApprovalDecision> => {
      print(`\n[审批] 工具 ${request.name} 请求执行：`);
      print(`  参数：${JSON.stringify(request.input)}`);
      try {
        const answer = (
          await rl.question("  允许一次？(y=允许 / n=拒绝 / c=取消任务) ")
        ).trim().toLowerCase();
        return answer === "y" ? "allow" : answer === "c" ? "cancel" : "deny";
      } catch {
        return "deny";
      }
    };

    const result = await runTask({
      input,
      model,
      streamFn,
      systemPrompt,
      tools: builtinTools,
      workspace: process.cwd(),
      approve,
      print,
    });

    // 开始 / 结束横幅已由 runTask 通过 print 输出，这里只补失败原因与退出码。
    if (result.error) console.error(`[错误] ${result.error}`);
    if (result.status === "failed") process.exitCode = 1;
  } finally {
    rl.close();
  }
}

void main().catch((err) => {
  console.error("CLI 异常退出：", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
