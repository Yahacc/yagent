/**
 * 工具清单 + 参数校验。
 * 工具不认识模型、界面、审批和打印；run() 只返回 ToolResult。
 */
import { promises as fs } from "node:fs";
import Ajv, { type ValidateFunction } from "ajv";
import type { ToolDefinition, ToolResult } from "./contracts.js";
import { resolveInsideWorkspace } from "./workspace.js";

/** demo.echo：read 风险，直接执行，不需要审批。 */
export const demoEchoTool: ToolDefinition = {
  name: "demo.echo",
  description: "原样返回输入文字，用于演示只读工具的直接执行路径",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string", minLength: 1 } },
    required: ["text"],
    additionalProperties: false,
  },
  risk: "read",
  async run(input): Promise<ToolResult> {
    const { text } = input as { text: string };
    return { ok: true, text, data: { tool: "demo.echo" } };
  },
};

/**
 * demo.confirm：刻意注册为 write 风险——它没有任何真实副作用，
 * 但只有这样才能在没有真实文件/命令的情况下演练完整审批流程。
 */
export const demoConfirmTool: ToolDefinition = {
  name: "demo.confirm",
  description: "需要用户批准后才返回确认文字，用于演示 write 风险工具的审批路径",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string", minLength: 1 } },
    required: ["text"],
    additionalProperties: false,
  },
  risk: "write",
  async run(input): Promise<ToolResult> {
    const { text } = input as { text: string };
    return { ok: true, text: `已获批准并执行，原文：${text}` };
  },
};

/** coding.read_file：只读读取工作区内已存在的文件；路径校验统一走 workspace.ts。 */
export const readFileTool: ToolDefinition = {
  name: "coding.read_file",
  description: "读取工作区内一个已存在的文本文件，返回其内容",
  inputSchema: {
    type: "object",
    properties: { path: { type: "string", minLength: 1 } },
    required: ["path"],
    additionalProperties: false,
  },
  risk: "read",
  async run(input, context): Promise<ToolResult> {
    const { path: relativePath } = input as { path: string };
    try {
      const target = await resolveInsideWorkspace(context.workspace, relativePath);
      const content = await fs.readFile(target, "utf8");
      // 长输出截断；完整文件引用（artifact）属于后续阶段
      return { ok: true, text: content.slice(0, 20000), data: { path: relativePath } };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { ok: false, text: `读取失败：${reason}` };
    }
  },
};

/** 工具注入清单：新增工具只需在这里加一项。 */
export const builtinTools: ToolDefinition[] = [demoEchoTool, demoConfirmTool, readFileTool];

const ajv = new Ajv();
const validators = new Map<string, ValidateFunction>();

/** 校验器按工具名缓存；返回错误说明，null 表示参数通过。 */
export function validateInput(tool: ToolDefinition, input: unknown): string | null {
  let validate = validators.get(tool.name);
  if (!validate) {
    validate = ajv.compile(tool.inputSchema);
    validators.set(tool.name, validate);
  }
  return validate(input) ? null : `工具 ${tool.name} 参数校验失败：${ajv.errorsText(validate.errors)}`;
}
