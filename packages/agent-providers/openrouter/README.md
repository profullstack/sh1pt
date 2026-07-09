# @profullstack/sh1pt-agent-provider-openrouter

**OpenRouter agent provider for [sh1pt](https://sh1pt.com).**

🌐 Homepage: **https://sh1pt.com**
📦 Source: **https://github.com/profullstack/sh1pt**

Routes LLM requests through [OpenRouter](https://openrouter.ai), giving your sh1pt agents access to hundreds of models — GPT-4o, Claude, Llama, DeepSeek, Gemini, and more — through a single unified API.

## Install

```bash
pnpm add @profullstack/sh1pt-agent-provider-openrouter
```

## Configuration

Set the following environment variables:

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ | Your OpenRouter API key (get one at https://openrouter.ai/keys) |
| `OPENROUTER_BASE_URL` | ❌ | Override the default API base URL (default: `https://openrouter.ai/api/v1`) |
| `OPENROUTER_MODEL` | ❌ | Default model to use (default: `openai/gpt-4o-mini`) |
| `OPENROUTER_HTTP_REFERER` | ❌ | Optional `HTTP-Referer` header for OpenRouter rankings |
| `OPENROUTER_X_TITLE` | ❌ | Optional `X-Title` header for OpenRouter rankings |

## Usage

```ts
import { openrouterProvider } from '@profullstack/sh1pt-agent-provider-openrouter';

// Validate environment
openrouterProvider.validateEnv(process.env);

// Chat completion
const response = await openrouterProvider.chat({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello!' },
  ],
});

console.log(response.content);
```

### With sh1pt agent framework

```ts
// In your sh1pt.config.ts
import { openrouterProvider } from '@profullstack/sh1pt-agent-provider-openrouter';

export default {
  agents: {
    openrouter: openrouterProvider,
  },
};
```

## Capabilities

| Capability | Supported |
|---|---|
| Chat | ✅ |
| Streaming | ❌ |
| Tool use | ❌ |
| List models | ❌ (not yet implemented) |

## Error handling

- **`AgentProviderConfigError`** — thrown when `OPENROUTER_API_KEY` is missing
- **`Error`** — thrown when the OpenRouter API returns a non-OK status or an empty response

## Links

- sh1pt: https://sh1pt.com
- OpenRouter: https://openrouter.ai
- OpenRouter API docs: https://openrouter.ai/docs
- Source + issues: https://github.com/profullstack/sh1pt

## License

MIT