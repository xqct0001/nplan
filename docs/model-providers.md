# Model Providers

The understanding layer requires an OpenAI-compatible model provider. The agent
does not produce `TaskSpec` or `TaskPlan` artifacts through no-model local
keyword rules.

There is no offline-only mode or `offline_preferred` constraint. Use a local
provider for local inference, or an authorized cloud provider when configured.

## Config Precedence

Configuration is merged in this order:

1. built-in providers
2. `.nplan/config.toml`
3. `$env:NPLAN_HOME\.nplan\config.toml` or `~/.nplan/config.toml`
4. environment variables
5. CLI `--config key=value` overrides

## Built-In Providers

Built-ins declare `context_location = "local"` for Ollama, LM Studio, vLLM,
llama.cpp, and LocalAI, and `context_location = "cloud"` for every remote
provider. For custom providers, the explicit field is authoritative. If it is
omitted, only `localhost`, `127.0.0.1`, and `::1` base URLs are classified as
local; all other hosts are classified as cloud. Changing a built-in provider's
`base_url` without also setting `context_location` discards the inherited
classification and uses the same URL fallback.

- `openai`: `https://api.openai.com/v1`, `OPENAI_API_KEY`, `responses`
- `openrouter`: `https://openrouter.ai/api/v1`, `OPENROUTER_API_KEY`, `chat_completions`
- `ollama`: `http://localhost:11434/v1`, `chat_completions`
- `lmstudio`: `http://localhost:1234/v1`, `chat_completions`
- `vllm`: `http://localhost:8000/v1`, `chat_completions`
- `llamacpp`: `http://localhost:8080/v1`, `chat_completions`
- `localai`: `http://localhost:8080/v1`, `chat_completions`
- `dashscope`: `https://dashscope.aliyuncs.com/compatible-mode/v1`, `DASHSCOPE_API_KEY`, `chat_completions`
- `tongyi`: `https://dashscope.aliyuncs.com/compatible-mode/v1`, `DASHSCOPE_API_KEY`, `chat_completions`
- `qwen`: `https://dashscope.aliyuncs.com/compatible-mode/v1`, `DASHSCOPE_API_KEY`, `chat_completions`
- `deepseek`: `https://api.deepseek.com`, `DEEPSEEK_API_KEY`, `chat_completions`
- `moonshot`: `https://api.moonshot.cn/v1`, `MOONSHOT_API_KEY`, `chat_completions`
- `kimi`: `https://api.moonshot.cn/v1`, `MOONSHOT_API_KEY`, `chat_completions`
- `zhipu`: `https://open.bigmodel.cn/api/paas/v4`, `ZHIPUAI_API_KEY`, `chat_completions`
- `bigmodel`: `https://open.bigmodel.cn/api/paas/v4`, `ZHIPUAI_API_KEY`, `chat_completions`
- `glm`: `https://open.bigmodel.cn/api/paas/v4`, `ZHIPUAI_API_KEY`, `chat_completions`
- `qianfan`: `https://qianfan.baidubce.com/v2`, `QIANFAN_API_KEY`, `chat_completions`
- `wenxin`: `https://qianfan.baidubce.com/v2`, `QIANFAN_API_KEY`, `chat_completions`
- `volcengine_ark`: `https://ark.cn-beijing.volces.com/api/v3`, `ARK_API_KEY`, `chat_completions`
- `doubao`: `https://ark.cn-beijing.volces.com/api/v3`, `ARK_API_KEY`, `chat_completions`
- `tencent_hunyuan`: `https://api.hunyuan.cloud.tencent.com/v1`, `HUNYUAN_API_KEY`, `chat_completions`
- `hunyuan`: `https://api.hunyuan.cloud.tencent.com/v1`, `HUNYUAN_API_KEY`, `chat_completions`
- `siliconflow`: `https://api.siliconflow.cn/v1`, `SILICONFLOW_API_KEY`, `chat_completions`
- `minimax`: `https://api.minimax.chat/v1`, `MINIMAX_API_KEY`, `chat_completions`
- `baichuan`: `https://api.baichuan-ai.com/v1`, `BAICHUAN_API_KEY`, `chat_completions`
- `yi`: `https://api.lingyiwanwu.com/v1`, `YI_API_KEY`, `chat_completions`
- `stepfun`: `https://api.stepfun.com/v1`, `STEPFUN_API_KEY`, `chat_completions`
- `modelscope`: `https://api-inference.modelscope.cn/v1`, `MODELSCOPE_API_KEY`, `chat_completions`

Any OpenAI-compatible provider can be added under
`[model_providers.<id>]`.

List the built-ins:

```cmd
nplan providers
```

Recommended setup:

```cmd
nplan setup
```

The setup list is deliberately short and grouped for normal use:

- recommended cloud: `deepseek`, `dashscope`, `kimi`, `zhipu`, `doubao`
- local: `ollama`, `lmstudio`
- more: other canonical built-ins and `custom`

Compatibility aliases such as `tongyi`, `qwen`, `moonshot`, `bigmodel`,
`glm`, `wenxin`, `volcengine_ark`, and `hunyuan` remain valid in existing
configuration, but are not repeated in the wizard. Invalid selections are
re-prompted instead of silently switching to custom setup. Chinese
confirmations such as `是`、`否`、`确认`、`取消` are accepted.

On a first interactive terminal launch with no configured model, `nplan` starts
the same setup wizard before opening the planning session. Use `nplan setup`
directly when you want to reconfigure an existing project.

`nplan setup` asks for a provider, API key, and model. In a TTY, API-key input
is masked and raw terminal mode is restored after Enter, Ctrl-C, EOF, or an
input error. For built-in providers it
uses the provider's OpenAI-compatible model list URL when available. For custom
providers, paste the model list URL or accept the default `<base_url>/models`.
If fetching models fails, the wizard falls back to the provider default or a
manual model name and prints a classified, actionable error without echoing
provider response bodies, URL query strings, or credentials.

## Diagnostics

`nplan doctor` checks only local configuration, API-key presence, provider
address shape, and project cloud-context consent state. It explicitly reports
that networking was not tested.

`nplan doctor --online` additionally sends one request to `models_url`, or to
`<base_url>/models` when no explicit URL is configured. The final path segment
must be `models`, `health`, `healthz`, `status`, `ready`, or `readiness`;
the full path must not contain task, chat, completion, response, message, or
embedding route segments. Anything else is rejected before fetch. It never calls `/chat/completions`,
`/responses`, or either planning operation, and sends no task or local context. Failures are
classified as invalid address, missing credentials, timeout, rate limit, not
found, provider error, or connection failure, with a safe next action.

The path check applies up to three bounded percent-decoding rounds. Encoded
slashes or backslashes, malformed escapes, invalid UTF-8, and over-encoded
remaining escapes are rejected before any request. Valid encoded non-separator
segments are preserved for the actual GET.

Wizard URL labels show only origin and path. User info, query strings, and
fragments are never printed, while the original value remains unchanged for
configuration storage and provider requests.

## Planning And Context Consent

A ready planning request uses two separate provider operations: TaskSpec
understanding, followed by TaskPlan generation. If clarification is required,
the second operation is skipped. Invalid TaskPlan output is returned for local
validation and does not trigger a third provider operation.

Local providers need no cloud-context consent. Before either operation uses a
cloud provider, NPlan requires a valid project-and-scope consent record or the
one-shot `--allow-cloud-context` flag. Non-interactive use without either exits
with code `2` before any provider request. The default interface language is
Simplified Chinese; `--lang en` selects English. User-facing output is a generic
WorkPlan.

When an API key is entered, the wizard can save it in `.nplan/config.toml`.
That directory is ignored by this repository's `.gitignore`, but environment
variables remain preferable for shared machines.

## Example

```toml
model = "qwen-plus"
model_provider = "dashscope"
model_max_output_tokens = 2000

[model_providers.dashscope]
name = "DashScope"
context_location = "cloud"
base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
env_key = "DASHSCOPE_API_KEY"
wire_api = "chat_completions"
request_max_retries = 2
timeout_ms = 60000
```

`model_max_output_tokens` is sent as `max_output_tokens` for Responses API
providers and `max_tokens` for chat-completions providers.

Compatibility flag for providers that should not receive OpenAI JSON-mode
parameters:

```toml
[model_providers.minimax]
name = "MiniMax"
context_location = "cloud"
base_url = "https://api.minimax.chat/v1"
env_key = "MINIMAX_API_KEY"
wire_api = "chat_completions"
response_format = "none"
```

## Model Required Behavior

If no model is configured, first interactive TTY launch starts the setup wizard.
Non-TTY interactive mode still starts and guides the user to run `nplan setup`.
Print mode exits with a model-required error and tells the user to run setup.

If a configured model fails or returns invalid JSON, the analysis fails. The
agent does not fall back to local rules to create a plan.
