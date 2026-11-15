/**
 * 工具层：只验证工具定义与纯执行函数。
 * 参数校验由 Pi 在调用前完成，相关用例在 run.test.ts 用 faux 覆盖。
 */
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../src/contracts.js";
import { builtinTools, demoConfirmTool, demoEchoTool } from "../src/tools.js";

const context: ToolContext = { workspace: process.cwd() };

describe("工具是纯执行函数", () => {
  it("demo.echo 原样返回输入", async () => {
    const result = await demoEchoTool.run({ text: "hello" }, context);
    expect(result).toMatchObject({ ok: true, text: "hello" });
  });

  it("demo.confirm 返回已获批准的文字", async () => {
    const result = await demoConfirmTool.run({ text: "hello" }, context);
    expect(result.ok).toBe(true);
    expect(result.text).toContain("已获批准");
  });

  it("工具定义只有描述、Schema、风险与 run，不持有界面依赖", () => {
    for (const tool of builtinTools) {
      expect(Object.keys(tool).sort()).toEqual(["description", "inputSchema", "name", "risk", "run"]);
      expect(tool.inputSchema).toMatchObject({ type: "object" });
    }
  });

  it("risk 目前只使用 read 与 write 两档", () => {
    expect(new Set(builtinTools.map((tool) => tool.risk))).toEqual(new Set(["read", "write"]));
  });
});
