# Prompt 规范与本地 Agent 任务拆解对比

## 文档目的

这份文档把两件事放在一起对齐：

1. 一个高质量 prompt 应该怎样写。
2. 当前项目中“Task Understanding + Task Decomposition Agent”的任务拆解思路应该怎样承接这套 prompt 结构。

核心判断是：好的 prompt 不一定要很长，也不一定要堆很多角色设定。它最重要的是把任务背景、目标、交付、边界和停顿点说清楚，让模型知道“我在做什么、对象是谁、结果要帮谁达到什么效果、什么时候应该继续、什么时候必须停下来问”。

## 一句话原则

先讲清楚任务上下文和目标，再讲清楚要完成的动作、输出格式、约束边界、质量要求和检查点。

如果信息不足，要明确标注不足与不确定性；如果涉及不可逆操作、任务范围变化、权限越界或需要用户补充信息，模型必须先停下来汇报，再继续。

## 好 Prompt 的最小结构

| 模块 | 应该写什么 | 作用 |
| --- | --- | --- |
| Context / 背景 | 当前在做什么、已有材料、业务或项目背景 | 让模型理解任务发生的环境 |
| Requirement / Request | 具体要模型完成什么动作 | 避免模型只泛泛分析，不落到动作 |
| Object / Audience | 对象是谁，结果给谁用 | 决定语气、深度、粒度和交付形态 |
| Desired Outcome | 结果要帮助对象达到什么效果 | 明确成功状态，而不是只描述过程 |
| Output Format | 最终结果怎么交付，必须包含哪些模块 | 约束输出结构，降低跑题概率 |
| Constraints | 不能假设什么，不能越界做什么，长度和范围限制 | 控制风险和输出边界 |
| Assumptions & Uncertainty | 哪些信息不足，允许哪些默认假设 | 避免错误假设被包装成事实 |
| Checkpoints | 什么时候继续，什么时候停下来询问 | 给模型明确的中途刹车机制 |
| Quality Bar | 什么算低质量输出，必须避免什么 | 防止空泛、重复、不可执行的回答 |

## 可复用 Prompt 模板

```text
# Task
我正在做【任务名称 / 任务类型】。

# Context
背景是：【项目、业务、已有材料、当前状态】。
对象是：【用户、读者、系统、代码库、文档或数据】。
这个结果需要帮助【对象】达到【具体效果】。

# Request
请你完成：【明确动作】。

# Output Format
输出必须包含：
1. 【模块 A】
2. 【模块 B】
3. 【模块 C】

输出形式为：【Markdown / JSON / 表格 / 代码 / 文档大纲等】。
长度或范围限制：【不要超过多少字 / 只覆盖哪些部分】。

# Constraints
- 不要假设：【不能擅自补齐的信息】。
- 不要越界：【不能做的动作，例如删除、提交、未授权联网、改范围】。
- 不要输出低质量内容：【例如空泛建议、没有依据的结论、不可执行步骤】。

# Checkpoints
如果出现以下情况，请先停下来说明并询问：
- 关键背景或输入缺失。
- 任务范围发生变化。
- 需要进行不可逆操作。
- 需要使用未授权工具、外部信息或敏感数据。
- 发现当前要求互相冲突，无法安全继续。

# Uncertainty Handling
如果信息不足，请明确列出：
1. 已知信息。
2. 缺失信息。
3. 不确定性。
4. 可以继续时采用的显式假设。
```

## 极简版本

```text
我正在做【任务】，对象是【谁 / 什么系统】，希望结果帮助【谁】达到【效果】。
请你完成【动作】。
输出必须包含【具体结构】。
不要假设【关键未知项】，不要越界做【禁止项】。
如果信息不足，请列出缺失和不确定性；如果涉及不可逆操作、范围变化或需要我补充信息，请先停下来问。
```

## 与当前 Agent 模块的对比

当前项目的核心设计是把用户自然语言请求先经过本地只读上下文整理，再交给已配置模型编译成 `TaskSpec`，最后把 `TaskSpec` 拆成有依赖关系的 `TaskPlan`。这正好可以承接上面的 prompt 结构。

| Prompt 模块 | 当前项目中的对应结构 | 说明 |
| --- | --- | --- |
| Context / 背景 | `context_pack`、`source_map`、`evidence_map`、`background_context`、`known_inputs`、`context_digest` | 记录项目说明、输入材料、本地上下文、证据来源和会话摘要 |
| Request / 动作 | `surface_request`、`inferred_goal`、`task_type` | 保留用户原话，同时推断真实目标和任务类型 |
| Object / Audience | `audience`、`target_object` | 显式记录结果给谁用、作用对象是什么 |
| Desired Outcome | `success_criteria`、`global_acceptance` | 把“想达到什么效果”变成可验收标准 |
| Output Format | `deliverables[].format`、`tasks[].outputs` | 交付物不只是名称，还应说明格式和必需性 |
| Constraints | `constraints.allowed_tools`、`constraints.forbidden_tools`、`conflict_report` | 约束模型不要越界执行或调用未授权工具，并把阻塞冲突交给校验器 |
| Missing Info | `missing_information.blocking`、`missing_information.non_blocking` | 区分阻塞型缺失和非阻塞型缺失 |
| Assumptions | `assumptions` | 只允许显式假设，不允许把假设写成事实 |
| Checkpoints | `checkpoint_policy`、`clarification`、`planning_readiness`、`conflict_report`、`replan_policy.trigger_on` | 负责判断何时追问、何时进入计划、何时因冲突暂停、何时重规划 |
| Quality Bar | `validateTaskSpec()`、`validateTaskPlan()` | 用规则检查必填字段、DAG、依赖、验收和覆盖率 |

## 当前实现对齐状态

这一节专门区分“当前已经实现”和“后续可以补强”的内容，避免把设计建议误读成现有 schema。

### 当前已经实现

当前代码已经实现了下面这条固定链路：

```text
用户自然语言请求
  -> collectContext / source_map
  -> context_pack / evidence_map / conflict_report
  -> configured model
  -> taskspec
  -> taskspec_report
  -> planner_input
  -> taskplan
  -> taskplan_report
```

如果 `taskspec_report.ready_for_planning` 为 `false`，输出会停在澄清阶段，只返回 `taskspec`、`taskspec_report` 和 `clarification_questions`。只有在 `TaskSpec` 通过规划闸门后，才会继续生成 `planner_input`、`taskplan` 和 `taskplan_report`。

当前运行时必须配置模型。没有模型配置时，不会使用本地规则解析用户请求，也不会产出 `TaskSpec` 或 `TaskPlan`。如果模型调用失败或返回非法 JSON，本次分析失败，不进入本地规则兜底。

当前上下文整理是轻量版 `Context Curator`：它只读扫描项目内允许的文本文件，生成 `SourceRef` 和 `EvidenceItem`，并把可用证据打包成 `context_pack` 交给模型。模型负责语义理解和字段抽取，本地规则负责来源映射、证据一致性、冲突检测、schema 归一化和规划闸门。

当前 `TaskSpec` 必填字段为：

```text
version
surface_request
inferred_goal
task_type
audience
target_object
deliverables
output_format
constraints
known_inputs
missing_information
assumptions
ambiguities
success_criteria
clarification
checkpoint_policy
quality_bar
planning_readiness
risk_level
provenance
```

当前 `TaskSpec` 还会携带这些上下文治理字段，用于支撑证据和冲突检查：

```text
context_requirements
source_map
evidence_map
context_report
conflict_report
```

当前 `TaskPlan` 必填字段为：

```text
version
plan_style
global_goal
global_acceptance
tasks
replan_policy
```

当前每个任务必填字段为：

```text
id
title
goal
inputs
outputs
dependencies
parallel_group
acceptance
complexity
risk
model_tier
state
```

当前 `TaskPlan` 的计划类型固定为 `dag`。也就是说，本文中讨论任务拆解时，应优先理解为 DAG，而不是任意任务树。

### 已经从 Prompt 规范补强进 TaskSpec 的字段

下面这些 prompt 规范中的概念，已经作为 `TaskSpec` 的一等字段出现：

| 概念 | 当前状态 | 建议 |
| --- | --- | --- |
| `audience` | 已实现 | 表示结果给谁看或给谁用 |
| `target_object` | 已实现 | 表示任务作用对象，例如代码库、文档、数据集 |
| `output_format` | 已实现 | 独立记录整体输出格式，便于校验交付格式 |
| `checkpoint_policy` | 已实现 | 结构化“什么时候必须停下来问” |
| `quality_bar` | 已实现 | 显式描述低质量输出的判定标准 |
| `risk_level` | 已实现 | 用于不可逆、高成本或敏感任务的请求级风险判断 |

所以，当前实现已经不只覆盖 `TaskSpec` / `TaskPlan` 的基础字段，也开始把 prompt 编写规范中的受众、对象、输出、检查点、质量标准和风险信息纳入结构化理解结果。

## 从项目报告迁移过来的核心思考

### 1. 不做全能 Agent，先做任务语义编译器

项目最初的设计判断是：不要一开始就做一个会循环、会调用工具、会自动执行的全能 agent。更稳妥的方式是先搭一个前置决策层：

```text
用户自然语言请求
  -> Context Curator：整理本地来源、证据和冲突
  -> TaskSpec：用户到底要什么
  -> TaskPlan：如何拆成步骤、依赖和验收
  -> taskspec_report / taskplan_report：理解和计划是否可靠
```

这个模块本身只负责只读上下文整理、任务理解和任务拆解，不负责真正修改文件、运行命令、未授权联网、提交代码或执行外部动作。配置模型 Provider 的调用属于任务理解链路，不等同于执行阶段联网。

### 2. 双层输出：TaskSpec + TaskPlan

`TaskSpec` 回答“任务是什么”，至少要覆盖：

- 用户原始请求。
- 推断出的真实目标。
- 任务类型。
- 受众和目标对象。
- 背景上下文。
- 上下文需求、来源映射和证据映射。
- 交付物。
- 约束。
- 冲突报告。
- 已知输入。
- 缺失信息。
- 显式假设。
- 歧义点。
- 成功标准。
- 澄清问题。
- 检查点策略、质量标准和风险等级。
- 是否可以进入规划。

`TaskPlan` 回答“任务怎么拆”，至少要覆盖：

- 全局目标。
- 全局验收标准。
- 必需交付物。
- 子任务列表。
- 每个子任务的输入、输出、依赖、验收标准、复杂度和风险。
- 重规划触发条件。

### 3. 稳定性来自结构和校验，不只来自模型能力

当前项目的方向不是让模型“自由发挥”，而是通过结构化字段、固定 schema、规划闸门和校验器来降低不确定性。

已有校验重点包括：

- `TaskSpec` 必填字段是否齐全。
- 是否存在交付物和成功标准。
- 阻塞型缺失信息是否被错误标记为 `ready`。
- 需要澄清时是否真的提出问题。
- readiness 分数过低时是否阻止直接规划。
- `TaskPlan` 是否有循环依赖。
- 每个依赖是否引用真实任务。
- 每个任务是否有输入、输出和验收标准。
- 必需交付物是否被任务输出覆盖。
- 任务数量是否超过策略上限。

### 4. 模型适配的关键是降低单次认知负载

不要让模型一次性完成“理解需求、拆任务、执行、自检”四件事。更可靠的拆法是：

- 模型：负责语义理解、字段抽取、交付物识别、缺失信息判断。
- 规则：只负责结构归一化、schema 校验、DAG 校验和质量闸门。
- 更强模型：处理模糊意图、冲突约束、重规划和高风险判断。

这样做的本质是把复杂问题拆成小的、可验证的中间产物。

## 推荐工作流

```text
1. 收集上下文
   读取用户请求、项目说明、已有文档、可用输入。

2. 整理证据包
   生成 source_map、evidence_map、context_pack 和 conflict_report。

3. 调用已配置模型编译 TaskSpec
   抽取目标、交付物、约束、缺失信息、假设和成功标准。

4. Readiness 闸门
   如果阻塞信息缺失、证据引用失效或上下文冲突阻塞，先生成澄清问题，不进入 TaskPlan。

5. 生成 TaskPlan
   只在 TaskSpec 足够明确时，拆成 DAG。

6. 校验计划
   检查必填字段、依赖、循环、输入输出、验收和交付物覆盖。

7. 输出结果
   返回 TaskSpec、TaskPlan、taskspec_report、taskplan_report，以及需要用户确认的问题。
```

## 什么时候必须停下来问

| 情况 | 为什么要停 | 应该怎么做 |
| --- | --- | --- |
| 缺少最终交付物 | 不知道要产出文档、代码、计划还是报告 | 询问交付物和格式 |
| 缺少目标对象 | 不知道给谁用，输出粒度会错 | 询问读者、用户或系统对象 |
| 关键约束冲突 | 例如既要求使用未授权工具又要求保持规划-only 边界 | 列出冲突，请用户选择 |
| 不可逆操作 | 删除、覆盖、发送、部署、购买、提交等都有风险 | 停下来请求明确确认 |
| 任务范围扩大 | 从写文档变成改代码、从本地变成联网调研 | 汇报范围变化并确认 |
| 需要额外权限 | 访问外部网络、私密数据、凭证或系统命令 | 说明需要什么权限和原因 |
| 计划校验失败 | DAG 有环、交付物没覆盖、任务无验收 | 先修复计划或请求补充信息 |
| 低置信度 | 只能靠猜测才能继续 | 标注不确定性，给出可选假设 |

## 哪些不能假设

不要擅自假设：

- 用户最终想要的交付物。
- 交付物格式、语言、长度和受众。
- 可以执行删除、覆盖、提交、发送、部署等不可逆动作。
- 可以进行未授权联网、调用外部工具或读取敏感数据。
- 模糊术语的具体含义，例如“整理一下”“优化一下”“重写一下”。
- 高风险事实，例如法律、医疗、财务、价格、政策、最新信息。

可以做的默认假设必须显式写出来，并且允许用户覆盖。

## 输出质量要求

低质量输出通常有这些表现：

- 只讲原则，不落到可执行结构。
- 没有区分已知信息、缺失信息和假设。
- 对用户没给的信息进行暗中脑补。
- 没有交付物清单和验收标准。
- 遇到风险动作仍然继续推进。
- 任务拆解没有输入、输出、依赖或验收。
- 看起来完整，但无法被验证。

高质量输出应该做到：

- 结构稳定。
- 信息边界清楚。
- 缺失和不确定性明确。
- 有可执行动作。
- 有可验证交付物。
- 有停顿点和确认机制。

## 示例对比

### 原始表达

```text
重新写文档，然后把目前项目中的 agent 任务拆解的想法和思考挪过来，写在新的文档中对比下。
```

### 结构化后的 Prompt

```text
# Task
我正在整理本项目的 Agent 设计文档。

# Context
项目是 NPlan，核心能力是把用户自然语言请求转换成 TaskSpec，再拆成可验证的 TaskPlan。
现有项目中已经有 README、agent-module-spec，以及本地 Word 报告中的任务理解与任务拆解设计思考。

# Request
请新增一份中文 Markdown 文档，重新整理“好 prompt 的结构”和“当前项目 Agent 任务拆解思路”的关系。

# Output Format
文档必须包含：
1. 好 prompt 的最小结构。
2. 可复用 prompt 模板。
3. 当前项目 TaskSpec / TaskPlan 思路摘要。
4. Prompt 模块与项目字段的对比表。
5. 什么时候必须停下来询问。
6. 不应假设和不应越界的内容。

# Constraints
- 不要把 prompt 写成很长的角色扮演。
- 不要假设用户没有提供的关键背景。
- 不要改动执行逻辑或源码。
- 文档重点是设计对齐和对比，不是新增功能实现。

# Checkpoints
如果发现现有项目文档和源码中的设计不一致，请在文档中标注差异。
如果需要执行不可逆操作或修改范围扩大，请先停下来确认。
```

## 建议后续补强

当前实现已经有 `TaskSpec`、`TaskPlan`、校验器、prompt 规范补强字段，以及轻量版 `Context Curator`。后续如果要继续深化，可以考虑把这些字段和上下文治理能力做得更细：

- `audience`：增加固定枚举或画像结构，例如 `human_reviewer`、`executor`、`maintainer`。
- `target_object`：支持更细的对象类型，例如 `repo`、`file`、`document`、`dataset`、`workflow`。
- `output_format`：与 `deliverables[].format` 做一致性检查，避免整体格式和交付物格式冲突。
- `checkpoint_policy`：把高风险动作和必须询问的问题映射成可校验规则。
- `quality_bar`：从文本列表升级为可定位的验收项。
- `risk_level`：让高风险请求自动触发更严格的澄清或人工确认。
- `source_map` / `evidence_map`：支持更精细的 span、引用片段评分和重复来源合并。
- `conflict_report`：从关键词规则升级到可配置冲突策略，例如模型 Provider 授权、外部工具权限、不可逆操作和敏感数据。
- `context_pack`：未来可以接入更强的文档解析、检索或多 Agent 协议，但不改变“必须配置模型”的运行边界。

这些补强不是为了让 prompt 变长，而是为了让任务边界更清楚、计划更可验证、后续执行更安全。
