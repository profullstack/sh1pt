import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';

const serviceName = 'sh1pt-dot-com';
const posthogLogsUrl = 'https://us.i.posthog.com/otlp/v1/logs';

declare global {
  // eslint-disable-next-line no-var
  var __posthogLoggerProvider: LoggerProvider | undefined;
  // eslint-disable-next-line no-var
  var __posthogLogger: ReturnType<LoggerProvider['getLogger']> | undefined;
}

export function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (globalThis.__posthogLoggerProvider) return;

  const token = process.env.POSTHOG_OTLP_TOKEN;
  if (!token) return;

  const exporter = new OTLPLogExporter({
    url: posthogLogsUrl,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const loggerProvider = new LoggerProvider({
    resource: resourceFromAttributes({
      'service.name': serviceName,
    }),
    processors: [new SimpleLogRecordProcessor(exporter)],
  });

  globalThis.__posthogLoggerProvider = loggerProvider;
  globalThis.__posthogLogger = loggerProvider.getLogger(serviceName);
}
