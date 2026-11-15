/**
 * 工作区路径边界：所有文件工具共用，避免每个工具各写一份校验。
 * realpath 统一大小写并解析符号链接 / junction，再用相对路径判断；
 * 单纯的字符串 startsWith 在 Windows 大小写和链接场景下不可靠。
 */
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * 解析并校验目标必须位于工作区内且已存在。
 * 新文件（尚不存在）需要校验其已有父目录，属于阶段 4 的 write_file 再补。
 */
export async function resolveInsideWorkspace(
  workspace: string,
  relativePath: string,
): Promise<string> {
  const workspaceReal = await fs.realpath(workspace);
  const targetReal = await fs.realpath(path.resolve(workspaceReal, relativePath));
  const rel = path.relative(workspaceReal, targetReal);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("路径越出工作区");
  }
  return targetReal;
}
