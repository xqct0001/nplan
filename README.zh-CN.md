# NPlan 中文说明

语言：[English](README.md) | 简体中文

NPlan 是一个本地任务理解与任务拆分模块，用于把自然语言请求转换成结构化规划产物。

它刻意保持“只规划、不执行”的边界。NPlan 不执行任务、不编辑文件、不运行 shell
命令、不创建 UI，也不管理远程 Agent。它负责理解请求、结合本地上下文生成可靠的任务
规格，并输出一个可供后续执行器审阅或执行的有界计划。

## 核心能力

- 生成并校验 `TaskSpec`：描述用户目标、交付物、约束、缺失信息、假设、成功标准、
  风险等级、来源证据和规划就绪状态。
- 生成并校验 `TaskPlan`：一个有边界的任务 DAG，包含任务输入、输出、依赖关系和验收
  检查。
- 在调用模型前，以只读方式整理本地项目上下文，生成 `source_map`、`evidence_map`、
  `context_report`、`conflict_report` 和 `context_pack`。
- 支持 OKF 风格本地知识文档：带 YAML frontmatter 的 Markdown、一个文件一个概念、
  概念之间用链接关联，并用引用记录来源。
- 支持可配置的 OpenAI-compatible 模型 Provider，包括常见本地运行时和主流国产模型
  平台。

## 安装

NPlan 没有 npm 运行时依赖。

```powershell
npm link
```

链接后即可使用：

```powershell
nplan
```

## 快速开始

配置模型 Provider：

```powershell
nplan init --provider ollama --model qwen2.5
```

或使用云端 Provider：

```powershell
$env:DASHSCOPE_API_KEY = "<your-key>"
nplan init --provider qwen --model qwen-plus
```

一次性输出 JSON 规划结果：

```powershell
nplan -p "设计一个本地文件整理工具，可以扫描文件、分类，并输出 Markdown 报告"
```

进入交互式会话：

```powershell
nplan
```

## CLI

```text
nplan [options] [prompt]

Commands:
  init              为当前项目配置模型 Provider
  providers         列出内置模型 Provider

Options:
  -p, --print       输出一个 JSON 结果后退出
  --model <name>    指定语义理解模型
  --provider <id>   指定模型 Provider
  --config-path <p> 加载模型配置 TOML
  -c key=value      使用 dotted key 覆盖配置
```

交互命令：

```text
/help
/init [provider] [model]
/providers
/status
/plan <prompt>
/json
/clear
/exit
```

本项目刻意不支持 `!` shell 执行。

## 模型 Provider

列出内置 Provider：

```powershell
nplan providers
```

当前支持的 Provider 类型包括：

- 本地运行时：`ollama`、`lmstudio`、`vllm`、`llamacpp`、`localai`
- 通用 OpenAI-compatible 网关：`openai`、`openrouter`
- 国产 Provider 与常用别名：`dashscope`、`tongyi`、`qwen`、`deepseek`、
  `moonshot`、`kimi`、`zhipu`、`bigmodel`、`glm`、`qianfan`、`wenxin`、
  `volcengine_ark`、`doubao`、`tencent_hunyuan`、`hunyuan`、`siliconflow`、
  `minimax`、`baichuan`、`yi`、`stepfun`、`modelscope`

部分国产 OpenAI-compatible API 不接受 JSON mode 参数。NPlan 支持在 Provider
配置中使用 `response_format = "none"` 这类兼容参数。

详见 [docs/model-providers.md](docs/model-providers.md) 和
[config.example.toml](config.example.toml)。

## 本地知识

NPlan 采用 Knowledge Catalog / OKF 中适合本地项目的部分：

- 带 YAML frontmatter 的 Markdown
- 一个文件一个概念
- 使用 `index.md` 做渐进式导航
- 使用 Markdown 链接表达关系
- 使用引用记录来源

项目知识包位于 [docs/nplan_knowledge](docs/nplan_knowledge/)。面向维护者的说明见
[docs/local-knowledge.md](docs/local-knowledge.md)。

上游参考仓库 `DOC/knowledge-catalog/` 保留给人阅读，但默认上下文扫描会忽略它，避免
大体量外部样例挤掉本项目自己的上下文。

## 作为库使用

```js
import { LocalPlanningAgent, OpenAICompatibleTaskModel, loadModelConfig } from './src/index.js';

const config = await loadModelConfig();
const modelClient = new OpenAICompatibleTaskModel({ config });
const agent = new LocalPlanningAgent({ modelClient });

const result = await agent.analyzeAsync(
  '设计一个本地文件整理工具，可以扫描文件、分类，并输出 Markdown 报告'
);

console.log(result.status);
```

## 项目结构

```text
src/
  agent.js              LocalPlanningAgent 门面入口
  cli.js                命令行入口
  context.js            本地上下文发现
  context-curator.js    来源排序与证据包生成
  context-policy.js     上下文发现默认策略
  conflicts.js          请求/上下文冲突检测
  model-client.js       OpenAI-compatible 模型客户端
  model-config.js       模型 Provider 配置
  model-init.js         项目配置写入器
  okf.js                OKF 风格 Markdown 解析器
  planning.js           TaskPlan DAG 生成
  provenance.js         SourceRef 与 EvidenceItem 工具
  schemas.js            Schema 产物与构造函数
  understanding.js      TaskSpec 归一化
  validation.js         TaskSpec 与 TaskPlan 校验器

docs/
  agent-module-spec.md
  local-knowledge.md
  model-providers.md
  nplan_knowledge/
```

## 开发

```powershell
npm test
```

如果 Windows PowerShell 的脚本执行策略受限：

```powershell
npm.cmd test
```

## 许可证

MIT
