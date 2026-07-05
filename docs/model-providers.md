# Model Providers

The understanding layer requires an OpenAI-compatible model provider. The agent
does not produce `TaskSpec` or `TaskPlan` artifacts through no-model local
keyword rules.

There is no offline-only mode or `offline_preferred` constraint. Use a local
provider for local inference, or an authorized cloud provider when configured.

## Config Precedence

Configuration is merged in this order:

1. built-in providers
2. `.n-agent/config.toml`
3. `$N_AGENT_HOME/config.toml` or `~/.n-agent/config.toml`
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
n-plan providers
```

Initialize or switch this project:

```powershell
# Local default, no API key stored
n-plan init --provider ollama --model qwen2.5

# Chinese cloud provider
n-plan init --provider dashscope --model qwen-plus
$env:DASHSCOPE_API_KEY = "<your-key>"

# Chinese provider aliases are accepted
n-plan init --provider kimi --model moonshot-v1-8k
$env:MOONSHOT_API_KEY = "<your-key>"

# Some domestic OpenAI-compatible providers reject response_format;
# built-in configs such as minimax/baichuan/yi/stepfun/modelscope omit it.
n-plan init --provider minimax --model MiniMax-M1
$env:MINIMAX_API_KEY = "<your-key>"

# Custom OpenAI-compatible endpoint
n-plan init --provider custom --model my-model --base-url http://127.0.0.1:8000/v1 --wire-api chat_completions
```

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

Run:

```powershell
$env:DASHSCOPE_API_KEY = "<your-key>"
n-plan --config-path .\config.example.toml -p "帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件"
```

One-off override:

```powershell
n-plan `
  --model "openai/gpt-4.1" `
  --provider openrouter `
  -p "Design a file organizer"
```

Custom provider:

```powershell
n-plan `
  --model "my-model" `
  --provider custom `
  --base-url "http://127.0.0.1:8000/v1" `
  --wire-api chat_completions `
  -p "Design a local tool"
```

## Model Required Behavior

If no model is configured, interactive mode still starts and guides the user to
run `n-plan init` or `/init`. Print mode exits with a model-required error and
tells the user to run `n-plan init` or pass `--model` / `--provider`.

If a configured model fails or returns invalid JSON, the analysis fails. The
agent does not fall back to local rules to create a plan.
