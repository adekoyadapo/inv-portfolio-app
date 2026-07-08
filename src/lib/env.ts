import { z } from "zod";

const envSchema = z.object({
  ADMIN_USERNAME: z.string().default("admin"),
  ADMIN_PASSWORD: z.string().default("admin123"),
  SESSION_SECRET: z.string().default("dev-session-secret-change-me"),
  ELASTICSEARCH_ENDPOINT: z.string().url().default("http://localhost:9200"),
  ELASTICSEARCH_API_KEY: z.string().optional(),
  ELASTICSEARCH_USERNAME: z.string().default("elastic"),
  ELASTICSEARCH_PASSWORD: z.string().default("changeme"),
  AI_PROVIDER: z.enum(["openai-compatible", "openai", "anthropic", "gemini"]).default("openai-compatible"),
  AI_MODEL: z.string().default("gpt-4.1-mini"),
  AI_BASE_URL: z.string().optional().default(""),
  AI_API_KEY: z.string().optional().default(""),
  S3_ENDPOINT: z.string().default("localhost"),
  S3_PORT: z.coerce.number().default(8333),
  S3_REGION: z.string().default("us-east-1"),
  S3_USE_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  S3_ACCESS_KEY: z.string().default("local-s3-access-key"),
  S3_SECRET_KEY: z.string().default("local-s3-secret-key"),
  S3_BUCKET: z.string().default("investment-logos"),
  S3_PUBLIC_URL: z.string().url().default("http://localhost:8333")
});

export const env = envSchema.parse(process.env);

if (process.env.ENFORCE_STRONG_SECRETS === "true") {
  const weakValues = new Set(["admin123", "changeme", "local-s3-secret-key", "dev-session-secret-change-me"]);
  const secretChecks = [
    ["ADMIN_PASSWORD", env.ADMIN_PASSWORD],
    ["SESSION_SECRET", env.SESSION_SECRET],
    ["ELASTICSEARCH_PASSWORD", env.ELASTICSEARCH_PASSWORD],
    ["S3_SECRET_KEY", env.S3_SECRET_KEY]
  ] as const;

  for (const [name, value] of secretChecks) {
    if (value.length < 16 || weakValues.has(value)) {
      throw new Error(`${name} must be set to a strong non-default value in production.`);
    }
  }
}
