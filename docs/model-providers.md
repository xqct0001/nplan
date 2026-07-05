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
5. CLI `-c key=value` overrides

## Built-In Providers

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

```powershell
nplan.cmd providers
```

Recommended setup:

```powershell
nplan.cmd setup
```

`nplan.cmd setup` asks for a provider, API key, and model. For built-in providers it
uses the provider's OpenAI-compatible model list URL when available. For custom
providers, paste the model list URL or accept the default `<base_url>/models`.
If fetching models fails, the wizard falls back to the provider default or a
manual model name.

When an API key is entered, the wizard can save it in `.nplan/config.toml`.
That directory is ignored by this repository's `.gitignore`, but environment
variables remain preferable for shared machines.

## Example

```toml
model = "qwen-plus"
model_provider = "dashscope"

[model_providers.dashscope]
name = "DashScope"
base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
env_key = "DASHSCOPE_API_KEY"
wire_api = "chat_completions"
request_max_retries = 2
timeout_ms = 60000
```

Compatibility flag for providers that should not receive OpenAI JSON-mode
parameters:

```toml
[model_providers.minimax]
name = "MiniMax"
base_url = "https://api.minimax.chat/v1"
env_key = "MINIMAX_API_KEY"
wire_api = "chat_completions"
response_format = "none"
```

## Model Required Behavior

If no model is configured, interactive mode still starts and guides the user to
run `nplan.cmd setup` from PowerShell. Print mode exits with a model-required
error and tells the user to run setup.

If a configured model fails or returns invalid JSON, the analysis fails. The
agent does not fall back to local rules to create a plan.
