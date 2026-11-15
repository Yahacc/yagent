import { describe, expect, it } from "vitest";
import type { ToolContext } from "../src/contracts.js";
import { demoConfirmTool, demoEchoTool, validateInput } from "../src/tools.js";

const context: ToolContext = { workspace: process.cwd() };

describe("工具参数校验", () => {
  it("合法参数通过校验", () => {
    expect(validateInput(demoEchoTool, { text: "hello" })).toBeNull();
  });

  it("不符合 Schema 的参数返回错误说明", () => {
    expect(validateInput(demoEchoTool, { text: "" })).toContain("参数校验失败");
    expect(validateInput(demoEchoTool, { other: 1 })).toContain("参数校验失败");
  });
});

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
});
