# Model Providers

The understanding layer can call OpenAI-compatible model providers before it
falls back to local keyword rules.

## Config Precedence

Configuration is merged in this order:

1. built-in providers
2. `.local-task-agent/config.toml`
3. `$LOCAL_TASK_AGENT_HOME/config.toml` or `~/.local-task-agent/config.toml`
4. environment variables
5. CLI `-c key=value` overrides

## Built-In Providers

- `openai`: `https://api.openai.com/v1`, `OPENAI_API_KEY`, `responses`
- `openrouter`: `https://openrouter.ai/api/v1`, `OPENROUTER_API_KEY`, `chat_completions`
- `ollama`: `http://localhost:11434/v1`, `chat_completions`
- `lmstudio`: `http://localhost:1234/v1`, `chat_completions`

Any OpenAI-compatible provider can be added under
`[model_providers.<id>]`.

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

Run:

```powershell
$env:DASHSCOPE_API_KEY = "<your-key>"
node ./src/cli.js --config-path .\config.example.toml -p "帮我设计一个本地文件整理工具，可以扫描文件、分类、输出报告、md文件"
```

One-off override:

```powershell
node ./src/cli.js `
  --model "openai/gpt-4.1" `
  --provider openrouter `
  -p "Design a file organizer"
```

Custom provider:

```powershell
node ./src/cli.js `
  --model "my-model" `
  --provider custom `
  --base-url "http://127.0.0.1:8000/v1" `
  --wire-api chat_completions `
  -p "Design a local tool"
```

## Fallback Behavior

If no model is configured, the agent uses local rules. If a configured model
fails or returns invalid JSON, the agent records `provenance.model_error` and
falls back to local rules instead of crashing.
