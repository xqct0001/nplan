# NPlan 中文说明

语言：[English](README.md) | 简体中文

NPlan 是一个本地任务理解与任务拆分模块，用来把自然语言请求转换成结构化规划产物。

它刻意保持“只规划、不执行”的边界。NPlan 不执行任务、不编辑文件、不运行 shell 命令、不创建 UI，也不管理远程 Agent。它负责理解请求、结合本地上下文，并输出可供后续执行器审阅的有界计划。

## 核心能力

- 生成并校验 `TaskSpec`：目标、交付物、约束、缺失信息、假设、成功标准、风险、来源证据和规划就绪状态。
- 生成并校验 `TaskPlan`：有界 DAG，包含任务输入、输出、依赖和验收检查。
- 在调用模型前，以只读方式整理本地项目上下文，生成 `source_map`、`evidence_map`、`context_report`、`conflict_report` 和 `context_pack`。
- 支持 OKF 风格本地知识文档：带 YAML frontmatter 的 Markdown、一个文件一个概念、概念之间用链接关联，并记录引用来源。
- 支持可配置的 OpenAI-compatible 模型 Provider，包括常见本地运行时和主流国内模型平台。

## 安装

```cmd
cd /d C:\Users\qiyue\Desktop\porgram\N_online_agent
install
```

之后打开任意 CMD，直接运行：

```cmd
nplan providers
nplan setup
nplan
```

卸载全局命令：

```cmd
uninstall
```

如果从 PowerShell 运行安装脚本，命令是 `.\install.cmd`。安装完成后的入口仍然是 `nplan`。

## 快速开始

`nplan setup` 会引导你选择 Provider、输入 API Key、从 Provider 的 OpenAI-compatible 模型列表接口获取模型选项，并写入 `.nplan/config.toml`。该目录已被 git 忽略。

如果还没有配置模型，在交互式终端里直接运行 `nplan` 会先启动同一个首次配置向导，然后再进入规划会话。`-p` 打印模式仍会清晰报错并提示先配置模型。

启动 NPlan：

```cmd
nplan
nplan "规划发布检查清单"
nplan -p "设计一个本地文件整理工具，可以扫描文件、分类，并输出 Markdown 报告"
```

界面默认使用简体中文；如需英文，添加 `--lang en`：

```cmd
nplan --lang en "Plan the release checklist"
```

## CLI

```text
nplan [options] [prompt]

Commands:
  exec [options] [prompt]
                    输出一次规划结果后退出
  setup             引导式 Provider/API Key/模型配置
  consent [status|revoke]
                    查看或撤销项目云端上下文授权
  providers         列出内置模型 Provider
  resume [id]       恢复已保存的规划会话
  doctor            检查本地 CLI 配置

Options:
  -p, --print       输出一个 JSON 结果后退出
  --output-format <json|summary|text>
                    选择 print 模式输出格式
  --input-format text
                    从命令行参数或 stdin 接收文本
  -c, --continue    继续最近一次本地规划会话
  -r, --resume [id] 恢复已保存的规划会话
  --model <name>    指定语义理解模型
  --provider <id>   指定模型 Provider
  --models-url <u>  指定模型列表 URL，用于自定义 Provider
  --config-path <p> 加载模型配置 TOML
  --config key=value
                    使用 dotted key 覆盖配置
  --allow-cloud-context
                    仅本次允许向云端发送上下文
  --lang <zh-CN|en> 设置界面语言，默认 zh-CN
  -V, --version     显示版本
```

旧的 `-c key=value` 配置覆盖仍然兼容；单独使用 `-c` 时会按 Claude Code 的习惯表示 `--continue`。

交互命令默认使用中文，英文命令仍然兼容：

```text
/帮助              /help
/服务商            /providers
/状态              /status
/配置, /设置       /config, /settings
/模型 [名称]       /model [name]
/上下文            /context
/来源              /sources
/步骤              /todo
/修改 <补充说明>   /revise <text>
/导出 [路径]       /export [path]
/规划 <任务>       /plan <prompt>
/完整              /json
/压缩 [备注]       /compact [note]
/清除, /重置, /新建 /clear, /reset, /new
/继续              /continue
/恢复 [会话编号]   /resume [id]
/退出, /结束       /exit, /quit
```

`/步骤` 和 `/来源` 是最近一次 WorkPlan 的只读视图。已有 WorkPlan 时直接输入文字、使用 `/修改 <补充说明>`，或在 `--resume` 后附带新任务文字，都会按修订处理；`/新建` 会清空该状态。`/导出` 是唯一会写出新规划文档的交互命令；不带路径时写入 `.nplan/exports/<plan-id>.md`，带路径时写入指定的 Markdown 文件。导出的内容是适合 Obsidian 使用的 WorkPlan，不会执行任务。

CLI 会在不突破规划边界的前提下对齐 Claude Code 的交互形态：无参数进入会话、带引号的 prompt 作为初始任务、`-p` 单次输出、stdin 管道输入、`--continue` / `--resume` 复用本地会话记录。同时保留 Codex 风格的 `exec`、`resume`、`doctor` 命令入口。`.nplan/sessions/` 保存经过净化的 v2 会话，并恢复最近结果与 WorkPlan，使 `/步骤`、`/来源` 和 `/导出` 在恢复后立即可用。会话不会保存证据正文、绝对路径、API Key、Authorization 或来源内容；v1 会话会明确提示不兼容，不会静默恢复成残缺状态。

本地 Provider 不需要云端授权。云端 Provider 必须在任何模型请求前完成授权：交互模式先预览有限的相对来源，可排除项目相对路径并记住当前 Provider 与范围指纹；`--allow-cloud-context` 只允许本次调用。使用 `nplan consent status` 查看项目授权，使用 `nplan consent revoke` 撤销。非交互模式没有有效授权时会在零模型请求的前提下以退出码 `2` 拒绝。

本项目刻意不支持 `!` shell 执行、文件编辑、工具权限模式、MCP 工具配置或远程 Agent 编排。`/export` 是明确列出的边界例外：它只会写出用户要求的 Markdown 规划产物，不会改动源码、创建真实 PR 或执行任务。

## 模型 Provider

列出内置 Provider：

```cmd
nplan providers
```

当前支持的 Provider 类型包括：

- 本地运行时：`ollama`、`lmstudio`、`vllm`、`llamacpp`、`localai`
- 通用 OpenAI-compatible 网关：`openai`、`openrouter`
- 国内 Provider 与常用别名：`dashscope`、`tongyi`、`qwen`、`deepseek`、`moonshot`、`kimi`、`zhipu`、`bigmodel`、`glm`、`qianfan`、`wenxin`、`volcengine_ark`、`doubao`、`tencent_hunyuan`、`hunyuan`、`siliconflow`、`minimax`、`baichuan`、`yi`、`stepfun`、`modelscope`

部分 OpenAI-compatible API 不接受 JSON mode 参数。NPlan 支持在 Provider 配置中使用 `response_format = "none"` 这类兼容参数。

详见 [docs/model-providers.md](docs/model-providers.md) 和 [config.example.toml](config.example.toml)。

## 本地知识

NPlan 采用 Knowledge Catalog / OKF 中适合本地项目的部分：

- 带 YAML frontmatter 的 Markdown
- 一个文件一个概念
- 使用 `index.md` 做渐进式导航
- 使用 Markdown 链接表达关系
- 使用引用记录来源

项目知识包位于 [docs/nplan_knowledge](docs/nplan_knowledge/)。面向维护者的说明见 [docs/local-knowledge.md](docs/local-knowledge.md)。

上游参考仓库 `DOC/knowledge-catalog/` 保留给人阅读，但默认上下文扫描会忽略它，避免大量外部样例挤掉本项目自己的上下文。

## 作为库使用

```js
import { LocalPlanningAgent, OpenAICompatiblePlanningModel, loadModelConfig } from './src/index.js';

const config = await loadModelConfig();
const modelClient = new OpenAICompatiblePlanningModel({ config });
const agent = new LocalPlanningAgent({ modelClient });

const result = await agent.analyzeAsync(
  '设计一个本地文件整理工具，可以扫描文件、分类，并输出 Markdown 报告'
);

console.log(result.status);
```

## 项目结构

```text
AGENTS.md              当前仓库的 Agent 工作规则
src/
  agent.js              LocalPlanningAgent 门面入口
  cli.js                命令行入口
  context.js            本地上下文发现
  context-curator.js    来源排序与证据包生成
  context-policy.js     上下文发现默认策略
  conflicts.js          请求/上下文冲突检测
  i18n.js               CLI 语言与中文命令别名
  model-client.js       OpenAI-compatible 模型客户端
  model-config.js       模型 Provider 配置
  model-init.js         项目配置写入器
  model-wizard.js       引导式模型配置向导
  okf.js                OKF 风格 Markdown 解析器
  planning.js           TaskPlan DAG 生成
  provenance.js         SourceRef 与 EvidenceItem 工具
  schemas.js            Schema 产物与构造函数
  understanding.js      TaskSpec 归一化
  validation.js         TaskSpec 与 TaskPlan 校验器
  work-plan.js          面向用户的通用 WorkPlan

docs/
  agent-design-prompt-lessons.md
  agent-module-spec.md
  local-knowledge.md
  model-providers.md
  nplan_knowledge/
```

## 开发验证

```powershell
npm.cmd test
```

## 许可

MIT
