# README, Brand Icon, and Test Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long bilingual README with concise product-entry documentation, add the approved Path N SVG icon, and remove test sources from the current Git tree while preserving them locally.

**Architecture:** Keep all changes at the documentation and repository-publication boundary. Add one self-contained SVG asset, make the English and Chinese READMEs structurally equivalent, and enforce private local tests through an anchored ignore rule plus Git untracking. Do not modify runtime source or NPlan's planning-only behavior.

**Tech Stack:** Markdown, SVG 1.1-compatible XML, JSON, Node.js CLI, PowerShell, Git.

## Global Constraints

- `README.md` remains the English primary document; `README.zh-CN.md` is the equivalent Chinese document.
- The icon is the approved 512×512 Path N design: dark navy rounded square, blue-to-teal N path, and three circular nodes.
- NPlan remains planning-only and must not claim task execution, shell execution, source editing, UI creation, or remote-agent orchestration.
- Root `/test/` stays on disk, is removed only from the current Git tree, and remains available to maintainers.
- Git history is not rewritten, and the final GitHub update is a normal fast-forward push to `main`.
- Do not add dependencies, PNG variants, wordmarks, badges, public test scripts, or new runtime behavior.

---

## File Structure

- Create `assets/nplan-icon.svg`: the single project icon referenced by both READMEs.
- Replace `README.md`: concise English product entry, setup path, operational commands, safety boundary, and documentation links.
- Replace `README.zh-CN.md`: Chinese mirror with the same facts, commands, and section order.
- Modify `docs/agent-module-spec.md`: publish syntax checks and qualify the full suite as maintainer-local.
- Modify `docs/local-knowledge.md`: publish the focused syntax check and qualify the full suite as maintainer-local.
- Modify `.gitignore`: add the anchored `/test/` publication rule.
- Modify `package.json`: remove only `scripts.test`; retain all other metadata and scripts.
- Untrack `test/`: remove the directory from the current Git index without removing local files.

### Task 1: Add the Path N SVG asset

**Files:**
- Create: `assets/nplan-icon.svg`

**Interfaces:**
- Consumes: the approved Path N visual specification.
- Produces: `assets/nplan-icon.svg`, referenced by both README files.

- [ ] **Step 1: Confirm the asset does not already exist**

Run:

```powershell
Test-Path assets/nplan-icon.svg
```

Expected: `False`.

- [ ] **Step 2: Create the approved SVG exactly**

Create `assets/nplan-icon.svg` with:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title description">
  <title id="title">NPlan</title>
  <desc id="description">A blue-to-teal N-shaped planning path connecting three nodes on a dark rounded square.</desc>
  <defs>
    <linearGradient id="nplan-path-gradient" x1="105" y1="390" x2="408" y2="118" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#38BDF8"/>
      <stop offset="1" stop-color="#2DD4BF"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="112" fill="#0F172A"/>
  <path d="M132 376V136L380 376V136" fill="none" stroke="url(#nplan-path-gradient)" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="132" cy="376" r="24" fill="#E0F2FE" stroke="#38BDF8" stroke-width="12"/>
  <circle cx="256" cy="256" r="24" fill="#E0F2FE" stroke="#22D3EE" stroke-width="12"/>
  <circle cx="380" cy="136" r="24" fill="#CCFBF1" stroke="#2DD4BF" stroke-width="12"/>
</svg>
```

- [ ] **Step 3: Validate the SVG structure and required semantics**

Run:

```powershell
$svg = [xml](Get-Content -Raw assets/nplan-icon.svg)
if ($svg.svg.viewBox -ne '0 0 512 512') { throw 'Unexpected viewBox' }
if ((Select-String -Path assets/nplan-icon.svg -Pattern '<circle ' -AllMatches).Matches.Count -ne 3) { throw 'Expected three nodes' }
Write-Output 'SVG_OK'
```

Expected: `SVG_OK`.

- [ ] **Step 4: Commit the icon**

```powershell
git add assets/nplan-icon.svg
git commit -m "feat: add NPlan path icon"
```

Expected: one new SVG file committed; no README or test changes yet.

### Task 2: Rewrite the English README

**Files:**
- Modify: `README.md`
- Modify during review: `docs/superpowers/plans/2026-07-11-readme-brand-test-publishing.md` (canonical target wording only)

**Interfaces:**
- Consumes: `assets/nplan-icon.svg`, current CLI help, `install.cmd`, and focused documents under `docs/`.
- Produces: the primary GitHub project page and the canonical section order mirrored by Task 3.

- [ ] **Step 1: Confirm the current README lacks the new product header**

Run:

```powershell
Select-String -Path README.md -SimpleMatch 'assets/nplan-icon.svg'
```

Expected: no output.

- [ ] **Step 2: Replace `README.md` with the concise English document**

Use this exact content:

````markdown
<p align="center">
  <img src="assets/nplan-icon.svg" alt="NPlan icon" width="112">
</p>

<h1 align="center">NPlan</h1>

<p align="center"><strong>Turn an ambiguous request into a reviewable, revisable, and exportable work plan.</strong></p>

<p align="center">English · <a href="README.zh-CN.md">简体中文</a></p>

NPlan is a local planning CLI. It reads bounded project context, clarifies the request, and produces validated planning artifacts: `TaskSpec`, `TaskPlan`, `ContextPack`, and a user-facing `WorkPlan`.

> [!IMPORTANT]
> NPlan plans only. It does not execute tasks, run shell commands, edit source files, generate a UI, or manage remote agents.

## Quick Start

Requirements: Windows and Node.js LTS.

From CMD in the repository directory:

```cmd
install.cmd
nplan setup
nplan "Plan a release checklist for this project"
```

From PowerShell, run `.\install.cmd` instead. Setup writes project-local configuration to `.nplan/config.toml`, which is ignored by Git.

## How It Works

```text
Request
  → read-only ContextPack
  → validated TaskSpec
  → bounded TaskPlan DAG
  → validated WorkPlan
```

If required information is missing, NPlan asks for clarification instead of inventing a plan. A ready request uses separate model calls for understanding and planning, followed by local validation.

## Core Capabilities

- Chinese-first interactive CLI with `--lang en` for English.
- OpenAI-compatible cloud and local model providers.
- Read-only local context with stable source and evidence identifiers.
- Project-scoped consent before local context is sent to a cloud provider.
- Sanitized local sessions with continue, resume, revise, and Markdown export.
- Deterministic checks for completeness, provenance, DAG validity, and deliverable coverage.

## Common Commands

| Command | Purpose |
| --- | --- |
| `nplan setup` | Configure a provider, API key, and model. |
| `nplan providers` | List built-in providers. |
| `nplan doctor` | Check local configuration without network access. |
| `nplan doctor --online` | Probe one allowlisted read-only model-list or health endpoint. |
| `nplan "<request>"` | Start an interactive planning session with an initial request. |
| `nplan -p --output-format summary "<request>"` | Print one concise planning result. |
| `nplan -c` | Continue the latest local session. |
| `nplan resume [id]` | Resume a saved session. |
| `nplan consent status` | Show cloud-context consent status. |
| `nplan consent revoke` | Revoke saved cloud-context consent. |

Inside an interactive session, use `/帮助` or `/help` to list commands. Useful actions include `/修改`, `/来源`, `/步骤`, `/导出`, `/继续`, and `/恢复`.

## Typical Use

Interactive planning:

```cmd
nplan "Break the v0.3 release into reviewable tasks"
```

One-shot summary:

```cmd
nplan -p --output-format summary "Plan a safe database migration"
```

English interface:

```cmd
nplan --lang en "Plan the release checklist"
```

## Models, Safety, and Privacy

Run `nplan setup` to choose a provider. Recommended cloud choices include DeepSeek, DashScope, Kimi, Zhipu AI, and Doubao; local choices include Ollama and LM Studio. Custom OpenAI-compatible providers are also supported.

- Local providers do not require cloud-context consent.
- Cloud providers require project-and-scope consent before either planning request.
- Non-interactive cloud use needs saved consent or the one-shot `--allow-cloud-context` flag.
- Within `nplan doctor`, networking occurs only with `--online`.
- Sanitized sessions are stored under `.nplan/sessions/` without source contents, evidence text, credentials, or authorization values.

## Documentation

- [Module contract](docs/agent-module-spec.md)
- [Model providers](docs/model-providers.md)
- [Local knowledge](docs/local-knowledge.md)
- [Planning and Obsidian workflow](docs/nplan_process_task_obsidian.md)
- [Project knowledge index](docs/nplan_knowledge/index.md)

## License

[MIT](LICENSE)
````

- [ ] **Step 3: Validate the documented CLI surface**

Run:

```powershell
node ./src/cli.js --help
```

Expected: help includes `setup`, `providers`, `doctor`, `resume`, `consent`, `--output-format`, `--allow-cloud-context`, and `--lang`.

- [ ] **Step 4: Validate every relative README link**

Run:

```powershell
node --input-type=module -e "import fs from 'node:fs'; const md=fs.readFileSync('README.md','utf8'); const links=[...md.matchAll(/\]\((?!https?:|#)([^)#]+)(?:#[^)]+)?\)/g)].map(m=>m[1]); const missing=links.filter(link=>!fs.existsSync(link)); if(missing.length) throw new Error('Missing: '+missing.join(', ')); console.log('README_LINKS_OK');"
```

Expected: `README_LINKS_OK`.

- [ ] **Step 5: Commit the English README**

```powershell
git add README.md
git commit -m "docs: rewrite English README"
```

Expected: `README.md` is committed; if review corrections change canonical target wording, the plan may be included in a separate review-fix commit.

### Task 3: Rewrite the Chinese README as an equivalent mirror

**Files:**
- Modify: `README.zh-CN.md`

**Interfaces:**
- Consumes: the section order and facts established by `README.md`.
- Produces: a concise Chinese project page with the same commands, boundaries, and links.

- [ ] **Step 1: Confirm the current Chinese README lacks the new product header**

Run:

```powershell
Select-String -Path README.zh-CN.md -SimpleMatch 'assets/nplan-icon.svg'
```

Expected: no output.

- [ ] **Step 2: Replace `README.zh-CN.md` with the concise Chinese document**

Use this exact content:

````markdown
<p align="center">
  <img src="assets/nplan-icon.svg" alt="NPlan 图标" width="112">
</p>

<h1 align="center">NPlan</h1>

<p align="center"><strong>把模糊需求转成可检查、可修改、可导出的工作计划。</strong></p>

<p align="center"><a href="README.md">English</a> · 简体中文</p>

NPlan 是一个本地规划 CLI。它读取有边界的项目上下文，澄清需求，并生成经过校验的规划产物：`TaskSpec`、`TaskPlan`、`ContextPack` 和面向用户的 `WorkPlan`。

> [!IMPORTANT]
> NPlan 只负责规划。它不会执行任务、运行 Shell 命令、修改源文件、生成 UI，也不会管理远程 Agent。

## 快速开始

环境要求：Windows 和 Node.js LTS。

在项目目录中打开 CMD：

```cmd
install.cmd
nplan setup
nplan "为这个项目规划一份发布检查清单"
```

如果使用 PowerShell，请运行 `.\install.cmd`。配置向导会把当前项目的设置写入 `.nplan/config.toml`，其所在的 `.nplan/` 目录不会被 Git 跟踪。

## 工作方式

```text
用户需求
  → 只读 ContextPack
  → 已校验 TaskSpec
  → 有边界的 TaskPlan DAG
  → 已校验 WorkPlan
```

如果缺少必要信息，NPlan 会先请求澄清，不会凭空编造计划。需求信息齐全后，需求理解和任务规划分别调用模型，最后在本地完成校验。

## 核心能力

- 默认使用简体中文，可通过 `--lang en` 切换英文。
- 支持兼容 OpenAI 接口的云端与本地模型服务商。
- 只读收集本地上下文，并保留稳定的来源与证据编号。
- 向云端发送本地上下文前，需要按项目和范围确认授权。
- 本地会话经过脱敏，支持继续、恢复、修改和 Markdown 导出。
- 本地校验完整性、来源一致性、DAG 合法性和交付物覆盖情况。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `nplan setup` | 配置服务商、API Key 和模型。 |
| `nplan providers` | 查看内置模型服务商。 |
| `nplan doctor` | 在不联网的情况下检查本地配置。 |
| `nplan doctor --online` | 探测白名单内的只读模型列表或健康检查接口。 |
| `nplan "<需求>"` | 使用初始需求开始交互式规划。 |
| `nplan -p --output-format summary "<需求>"` | 输出一次精简规划结果。 |
| `nplan -c` | 继续最近的本地会话。 |
| `nplan resume [编号]` | 恢复已保存的会话。 |
| `nplan consent status` | 查看云端上下文授权状态。 |
| `nplan consent revoke` | 撤销已保存的云端上下文授权。 |

进入交互会话后，使用 `/帮助` 或 `/help` 查看命令。常用操作包括 `/修改`、`/来源`、`/步骤`、`/导出`、`/继续` 和 `/恢复`。

## 常见用法

交互式规划：

```cmd
nplan "把 v0.3 发布工作拆成可审查的任务"
```

一次输出摘要：

```cmd
nplan -p --output-format summary "规划一次安全的数据库迁移"
```

使用英文界面：

```cmd
nplan --lang en "Plan the release checklist"
```

## 模型、安全与隐私

运行 `nplan setup` 选择服务商。推荐的云端选项包括 DeepSeek、DashScope、Kimi、智谱 AI 和豆包；本地选项包括 Ollama 和 LM Studio。也可以配置其他兼容 OpenAI 接口的服务商。

- 本地服务商不需要云端上下文授权。
- 云端服务商在两次规划请求前都需要有效的项目与范围授权。
- 非交互式云端调用需要已保存授权，或使用仅本次有效的 `--allow-cloud-context`。
- 在 `nplan doctor` 命令中，只有指定 `--online` 才会发起网络探测。
- 脱敏会话保存在 `.nplan/sessions/`，不包含源文件内容、证据文本、凭据或授权值。

## 文档

- [模块契约](docs/agent-module-spec.md)
- [模型服务商](docs/model-providers.md)
- [本地知识库](docs/local-knowledge.md)
- [规划与 Obsidian 工作流](docs/nplan_process_task_obsidian.md)
- [项目知识索引](docs/nplan_knowledge/index.md)

## 许可证

[MIT](LICENSE)
````

- [ ] **Step 3: Validate bilingual structure and command parity**

Run:

```powershell
$enSections = (Select-String -Path README.md -Pattern '^## ').Count
$zhSections = (Select-String -Path README.zh-CN.md -Pattern '^## ').Count
if ($enSections -ne 8 -or $zhSections -ne 8) { throw "Section mismatch: EN=$enSections ZH=$zhSections" }
$commands = @('nplan setup','nplan providers','nplan doctor','nplan doctor --online','nplan -c','nplan resume','nplan consent status','nplan consent revoke','--allow-cloud-context','--lang en')
foreach ($command in $commands) {
  if (-not (Select-String -Path README.md -SimpleMatch $command -Quiet)) { throw "Missing from English README: $command" }
  if (-not (Select-String -Path README.zh-CN.md -SimpleMatch $command -Quiet)) { throw "Missing from Chinese README: $command" }
}
Write-Output 'README_PARITY_OK'
```

Expected: `README_PARITY_OK`.

- [ ] **Step 4: Validate every relative Chinese README link**

Run:

```powershell
node --input-type=module -e "import fs from 'node:fs'; const md=fs.readFileSync('README.zh-CN.md','utf8'); const links=[...md.matchAll(/\]\((?!https?:|#)([^)#]+)(?:#[^)]+)?\)/g)].map(m=>m[1]); const missing=links.filter(link=>!fs.existsSync(link)); if(missing.length) throw new Error('Missing: '+missing.join(', ')); console.log('README_ZH_LINKS_OK');"
```

Expected: `README_ZH_LINKS_OK`.

- [ ] **Step 5: Commit the Chinese README**

```powershell
git add README.zh-CN.md
git commit -m "docs: rewrite Chinese README"
```

Expected: only `README.zh-CN.md` committed in this task.

### Task 4: Make the local test suite private to the working copy

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `docs/agent-module-spec.md`
- Modify: `docs/local-knowledge.md`
- Untrack: `test/`

**Interfaces:**
- Consumes: the existing local `test/` directory and the `node --test` automatic test discovery runner.
- Produces: a public Git tree without test sources or a public test script, public syntax-check guidance, and maintainer-local full-suite guidance while retaining the full local test suite.

- [ ] **Step 1: Record the current failure state**

Run:

```powershell
$tracked = @(git ls-files test)
$localCount = (Get-ChildItem test -Recurse -File).Count
$package = Get-Content -Raw package.json | ConvertFrom-Json
if ($tracked.Count -eq 0) { throw 'Expected tracked tests before migration' }
if ($localCount -eq 0) { throw 'Expected local tests before migration' }
if (-not $package.scripts.test) { throw 'Expected public test script before migration' }
Write-Output "TRACKED=$($tracked.Count) LOCAL=$localCount SCRIPT=$($package.scripts.test)"
```

Expected: tracked and local counts are greater than zero, and the script is `node --test`.

- [ ] **Step 2: Add the anchored ignore rule**

Append this repository-root rule to `.gitignore` immediately after `.worktrees/`:

```gitignore
/test/
```

- [ ] **Step 3: Remove only the public test script from `package.json`**

The resulting scripts object must be:

```json
"scripts": {
  "start": "node ./src/cli.js",
  "setup": "node ./src/cli.js setup",
  "providers": "node ./src/cli.js providers",
  "smoke": "node ./src/cli.js providers"
}
```

- [ ] **Step 4: Qualify full-suite verification in the focused documents**

Replace the `docs/agent-module-spec.md` Verification section with:

````markdown
## Verification

Use Node.js only. Public clones can run syntax checks:

```powershell
node --check src/cli.js
node --check src/model-config.js
node --check src/model-init.js
node --check src/model-wizard.js
node --check src/context-curator.js
node --check src/provenance.js
```

Maintainers with the private local `test/` directory can additionally run:

```powershell
node --test
```
````

Replace step 5 under `docs/local-knowledge.md` / `Adding A New Concept` and insert step 6 with:

````markdown
5. Run the public syntax check:

```powershell
node --check src/okf.js
```

6. Maintainers with the private local `test/` directory can additionally run:

```powershell
node --test
```
````

- [ ] **Step 5: Remove tests from the Git index without deleting local files**

Run:

```powershell
git rm --cached -r test
```

Expected: Git stages deletion of every tracked `test/` file; the files remain on disk.

- [ ] **Step 6: Run the retained local suite**

Run:

```powershell
node --test
```

Expected: 193 tests total, 190 pass, 0 fail, and 3 Windows symlink-permission skips.

- [ ] **Step 7: Verify the publication boundary**

Run:

```powershell
$tracked = @(git ls-files test)
$localCount = (Get-ChildItem test -Recurse -File).Count
$package = Get-Content -Raw package.json | ConvertFrom-Json
if ($tracked.Count -ne 0) { throw 'Tests are still tracked' }
if ($localCount -eq 0) { throw 'Local tests were removed' }
if ($null -ne $package.scripts.test) { throw 'Public test script still exists' }
git check-ignore test
Write-Output "TEST_PUBLICATION_OK LOCAL=$localCount"
```

Expected: `git check-ignore` prints `test`, followed by `TEST_PUBLICATION_OK` with a positive local count.

- [ ] **Step 8: Commit the test publication change**

```powershell
git add .gitignore package.json docs/agent-module-spec.md docs/local-knowledge.md
git commit -m "chore: keep tests out of published tree"
```

Expected: `.gitignore`, `package.json`, `docs/agent-module-spec.md`, and `docs/local-knowledge.md` are modified, and all tracked `test/` files are recorded as deletions while remaining locally available.

### Task 5: Run release checks and update GitHub

**Files:**
- Verify: `README.md`
- Verify: `README.zh-CN.md`
- Verify: `assets/nplan-icon.svg`
- Verify: `.gitignore`
- Verify: `package.json`
- Verify: `docs/agent-module-spec.md`
- Verify: `docs/local-knowledge.md`
- Verify: local untracked `test/`

**Interfaces:**
- Consumes: all deliverables from Tasks 1–4 and the existing `origin/main` remote.
- Produces: a verified fast-forward update on GitHub `main`.

- [ ] **Step 1: Run combined static verification**

Run:

```powershell
$svg = [xml](Get-Content -Raw assets/nplan-icon.svg)
$package = Get-Content -Raw package.json | ConvertFrom-Json
if ($svg.svg.viewBox -ne '0 0 512 512') { throw 'Invalid SVG viewBox' }
if ($null -ne $package.scripts.test) { throw 'Unexpected public test script' }
if (@(git ls-files test).Count -ne 0) { throw 'Tracked tests remain' }
if ((Get-ChildItem test -Recurse -File).Count -eq 0) { throw 'Local tests missing' }
if (-not (Select-String README.md -SimpleMatch 'assets/nplan-icon.svg' -Quiet)) { throw 'English icon reference missing' }
if (-not (Select-String README.zh-CN.md -SimpleMatch 'assets/nplan-icon.svg' -Quiet)) { throw 'Chinese icon reference missing' }
if (-not (Select-String docs/agent-module-spec.md -SimpleMatch 'Maintainers with the private local `test/` directory can additionally run:' -Quiet)) { throw 'Module spec does not qualify the full suite as maintainer-local' }
if (-not (Select-String docs/local-knowledge.md -SimpleMatch 'Maintainers with the private local `test/` directory can additionally run:' -Quiet)) { throw 'Local knowledge doc does not qualify the full suite as maintainer-local' }
git diff --check
Write-Output 'RELEASE_CHECKS_OK'
```

Expected: `RELEASE_CHECKS_OK` and no whitespace errors.

- [ ] **Step 2: Run non-network CLI smoke checks**

Run:

```powershell
node ./src/cli.js --version
node ./src/cli.js --help
node ./src/cli.js providers
```

Expected: version `0.2.0`, Chinese help text, and the built-in provider list; all commands exit successfully.

- [ ] **Step 3: Review the exact outgoing tree change**

Run:

```powershell
git status --short --branch
git diff --name-status origin/main...HEAD
```

Expected: the branch is ahead of `origin/main`; outgoing files are limited to the approved design/plan documents, both READMEs, `assets/nplan-icon.svg`, `.gitignore`, `package.json`, and deletions under `test/`. The working tree has no tracked modifications.

- [ ] **Step 4: Push `main` without rewriting history**

Run:

```powershell
git push origin main
```

Expected: a normal fast-forward update of `origin/main`; no `--force` option is used.

- [ ] **Step 5: Confirm local and remote tips match**

Run:

```powershell
$local = git rev-parse main
$remote = git rev-parse origin/main
if ($local -ne $remote) { throw "Tip mismatch: local=$local remote=$remote" }
git status --short --branch
Write-Output "PUBLISHED=$local"
```

Expected: `main...origin/main` with no ahead/behind count, followed by one `PUBLISHED=<commit>` line.
