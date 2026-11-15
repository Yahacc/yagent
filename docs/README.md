# Agent Desktop 学习文档

本项目从零实现 Windows 编程 Agent 桌面应用，学习优先：先做模块化闭环，再按需要拆进程。阶段 1（CLI + Mock Agent）已实现，见[阶段说明](stages/01-cli-mock.md)；其余阶段仍是设计目标。

## 推荐阅读顺序

1. [学习版架构](architecture/2026-10-12-agent-desktop-design.md)：目标、四个扩展点、数据流、审批、保存与演进。
2. [分阶段学习路线](learning/01-roadmap.md)：从 CLI/Mock 到 Pi、Electron、工具、历史与安装包。
3. [阶段 1 说明](stages/01-cli-mock.md)：CLI + Mock Agent 的实现、运行与验收记录。
4. [术语表](learning/02-glossary.md)：阅读中遇到不熟悉的名词时查阅。
5. [文档与注释约定](guides/documentation-and-comments.md)：后续每个模块、阶段和关键接口如何写说明。

文档分两类：[阶段 1 说明](stages/01-cli-mock.md)描述**已实现**的代码（直线循环、注入 Agent/prompt/tools、工具与打印脱钩，以及 risk 实际只有两档行为等当前限制）；[学习版架构](architecture/2026-10-12-agent-desktop-design.md)描述**接入 Pi + Electron 后的目标形态**（Core、事件链、进程边界、状态机）。架构文档第 1 节有一张「已实现 vs 目标形态」对照表，读其他章节前先对照它，不要把目标接口当成当前代码。Mermaid 图需要支持 Mermaid 的 Markdown 查看器；不支持时可阅读代码块对应的解释。

想先跑起来看效果，直接读阶段 1 说明的运行步骤；想理解后续演进，再从架构的第 4 节开始沿着“界面请求 → Core → Agent → 工具审批 → 文件或命令 → 结果”的目标路径阅读。

## 当前文档清单

| 文件 | 定位 |
| --- | --- |
| `README.md`（本文件） | 阅读顺序与文档定位 |
| `stages/01-cli-mock.md` | **唯一描述已实现代码**的阶段说明：结构、数据流、运行记录、验收与当前限制 |
| `architecture/2026-10-12-agent-desktop-design.md` | 接入 Pi + Electron 后的目标架构与设计约束 |
| `learning/01-roadmap.md` | 阶段 1～6 的学习目标与验收；阶段 2 以后是计划 |
| `learning/02-glossary.md` | 目标架构术语表 |
| `guides/documentation-and-comments.md` | 文档与注释的写法约定 |
| `antigravity-blank-screen-diagnosis.md` | **与本项目无关**：Antigravity 编辑器在本机的白屏排障记录，仅作留存，不参与架构或阶段说明 |

代码与文档不一致时，以 `src/` 的实现和阶段 1 说明为准；发现落差时同步修正文档，而不是把目标形态写成已完成。
