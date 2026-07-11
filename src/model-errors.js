const ERROR_MESSAGES = {
  timeout: {
    message_zh: '模型服务响应超时。',
    next_action_zh: '检查网络或增大 timeout_ms 后重试。',
    message_en: 'The model provider timed out.',
    next_action_en: 'Check the network or increase timeout_ms, then retry.'
  },
  credentials: {
    message_zh: 'API Key 无效或没有访问权限。',
    next_action_zh: '重新运行 nplan setup 配置密钥，并确认账号有权使用该模型。',
    message_en: 'The API key is invalid or lacks permission.',
    next_action_en: 'Run nplan setup again and confirm that the account can use this model.'
  },
  rate_limit: {
    message_zh: '请求过多或账号额度不足。',
    next_action_zh: '稍后重试，并检查账号额度与限流设置。',
    message_en: 'The provider rate limit or account quota was reached.',
    next_action_en: 'Retry later and check the account quota and rate limits.'
  },
  not_found: {
    message_zh: '模型或服务接口不存在。',
    next_action_zh: '检查模型名称、base_url 和 models_url。',
    message_en: 'The model or provider endpoint was not found.',
    next_action_en: 'Check the model name, base_url, and models_url.'
  },
  provider_error: {
    message_zh: '模型服务暂时异常。',
    next_action_zh: '稍后重试，或切换其他 Provider。',
    message_en: 'The model provider is temporarily unavailable.',
    next_action_en: 'Retry later or switch to another provider.'
  },
  invalid_output: {
    message_zh: '模型返回内容不符合规划格式。',
    next_action_zh: '检查模型兼容性，或切换更可靠的模型后重试。',
    message_en: 'The model response did not match the planning format.',
    next_action_en: 'Check model compatibility or retry with a more reliable model.'
  },
  invalid_url: {
    message_zh: 'Provider 地址无效。',
    next_action_zh: '检查 base_url 和 models_url，地址必须是完整的 http 或 https URL。',
    message_en: 'The provider address is invalid.',
    next_action_en: 'Check base_url and models_url; they must be complete HTTP or HTTPS URLs.'
  },
  unsafe_health_endpoint: {
    message_zh: '健康检查地址不安全。',
    next_action_zh: '将 models_url 改为只读的 models、health、healthz、status、ready 或 readiness 接口。',
    message_en: 'The configured health-check endpoint is unsafe.',
    next_action_en: 'Set models_url to a read-only models, health, healthz, status, ready, or readiness endpoint.'
  },
  network: {
    message_zh: '无法连接模型服务。',
    next_action_zh: '检查网络、本地服务地址或代理设置。',
    message_en: 'NPlan could not connect to the model provider.',
    next_action_en: 'Check the network, local service address, or proxy settings.'
  }
};

export function classifyModelError(error) {
  const status = modelErrorStatus(error);
  const name = String(error?.name || error?.cause?.name || '');
  const code = String(error?.code || error?.cause?.code || '');
  const message = String(error?.message || '');

  if (name === 'TimeoutError' || name === 'AbortError' || code === 'ETIMEDOUT') {
    return result('timeout');
  }
  if (status === 401 || status === 403) return result('credentials');
  if (status === 429) return result('rate_limit');
  if (status === 404) return result('not_found');
  if (status >= 500) return result('provider_error');
  if (code === 'unsafe_health_endpoint') return result('unsafe_health_endpoint');
  if (code === 'ERR_INVALID_URL' || /invalid url|failed to parse url/i.test(message)) {
    return result('invalid_url');
  }
  if (/json|schema|object|planning format/i.test(message)) return result('invalid_output');
  return result('network');
}

export function formatModelError(error, locale = 'zh-CN') {
  const classified = error?.code && ERROR_MESSAGES[error.code]
    ? { ...ERROR_MESSAGES[error.code], ...error }
    : classifyModelError(error);
  if (String(locale).toLowerCase().startsWith('en')) {
    return `${classified.message_en}\nNext step: ${classified.next_action_en}`;
  }
  return `${classified.message_zh}\n下一步：${classified.next_action_zh}`;
}

export function displaySafeUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return '[invalid URL]';
    return `${url.origin}${url.pathname}`;
  } catch {
    return '[invalid URL]';
  }
}

function result(code) {
  return { code, ...ERROR_MESSAGES[code] };
}

function modelErrorStatus(error) {
  for (const value of [error?.status, error?.response?.status, error?.cause?.status]) {
    const status = Number(value || 0);
    if (Number.isInteger(status) && status > 0) return status;
  }
  return 0;
}
