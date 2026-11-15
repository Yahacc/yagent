/**
 * 本项目只有 Pi 一个 Agent（SDK 的 `createAgentSession()`，唯一调用点在 run.ts）。
 * 本文件只配置「用哪个模型」——Pi AI 的 provider / model id / streamFn，
 * 没有 Agent 接口、注册表或适配器。faux 与 openai 都是 Pi AI 的模型来源，不是另一个 Agent。
 */
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxText,
  fauxToolCall,
  type Api,
  type FauxResponseFactory,
  type FauxResponseStep,
  type Model,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import type { StreamFn } from "@earendil-works/pi-agent-core";

/** 构造 Pi 会话需要的模型项；类型直接取上游，不自定义第二套。 */
export interface PiModel {
  model: Model<Api>;
  streamFn: StreamFn;
}

/** 从 transcript 的最后一条 user 消息取文字，作为演示工具的参数。 */
const demoStep: FauxResponseFactory = (context) => {
  const lastUser = [...context.messages].reverse().find((m) => m.role === "user");
  const content = lastUser?.role === "user" ? lastUser.content : "";
  const text = typeof content === "string"
    ? content
    : content
      .filter((block): block is { type: "text"; text: string } => block.type === "text")
      .map((block) => block.text)
      .join("");
  return fauxAssistantMessage(
    [fauxText("收到任务，我将调用演示工具处理。"), fauxToolCall("demo.confirm", { text })],
    { stopReason: "toolUse" },
  );
};

/**
 * 演示与测试用的模型：Pi 自带 faux provider，脚本化回复，不需要 API Key。
 * 每次调用都新建一份响应脚本，避免多次 Run 互相消耗。
 */
export function createDemoModel(responses?: FauxResponseStep[]): PiModel {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  faux.setResponses(responses ?? [
    demoStep,
    fauxAssistantMessage("演示完成，已收到工具结果。"),
  ]);
  return { model: faux.getModel(), streamFn: models.streamSimple.bind(models) };
}

/**
 * CLI 唯一的模型配置入口。未设置 YAGENT_MODEL 时用演示模型；
 * 设置后走真实 OpenAI-compatible provider，凭据由 Pi 从 OPENAI_API_KEY 等来源解析。
 */
export function createPiModel(): PiModel {
  const modelId = process.env.YAGENT_MODEL;
  if (!modelId) return createDemoModel();

  const models = createModels();
  models.setProvider(openaiProvider());
  const model = models.getModel("openai", modelId);
  if (!model) throw new Error(`模型未找到：openai/${modelId}；用 YAGENT_MODEL 指定 catalog 内的 id`);
  return { model, streamFn: models.streamSimple.bind(models) };
}
