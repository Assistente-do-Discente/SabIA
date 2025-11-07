import dotenv from "dotenv";

dotenv.config();

function getEnv(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (value === undefined || value === "") {
        if (defaultValue !== undefined) return defaultValue;
        throw new Error(`❌ Environment variable ${key} is required but not defined`);
    }
    return value;
}

export const ENV = {
    PORT: parseInt(getEnv("PORT", "3000"), 10),
    URL_API_AD: getEnv("URL_API_AD", "http://localhost:8080"),
    URL_API_SABIA: getEnv("URL_API_SABIA", "http://localhost:3000"),
    URL_AUTH_SERVER: getEnv("URL_AUTH_SERVER", "http://localhost:9000"),
    URL_REDIS: getEnv("URL_REDIS", "redis://localhost:6379"),

    OIDC_ISSUER: getEnv("OIDC_ISSUER", "http://localhost:9000"),
    OIDC_CLIENT_ID: getEnv("OIDC_CLIENT_ID", "sabia-agent"),
    OIDC_CLIENT_SECRET: getEnv("OIDC_CLIENT_SECRET", "sabia-agent"),
    OIDC_REDIRECT_URI: getEnv("OIDC_REDIRECT_URI", "http://localhost:3000/auth/callback"),
    API_KEY_LOGIN: getEnv("API_KEY_LOGIN", "sabia-agent"),

    STATE_TTL_SEC: parseInt(getEnv("STATE_TTL_SEC", "10"), 10),
    SESSION_TTL_SEC: parseInt(getEnv("SESSION_TTL_SEC", "10"), 10),
    SHORTLINK_TTL_SEC: parseInt(getEnv("SHORTLINK_TTL_SEC", "10"), 10),
    TOOLS_TTL_SEC: parseInt(getEnv("TOOLS_TTL_SEC", "10"), 10),
    AGENT_TTL_SEC: parseInt(getEnv("AGENT_TTL_SEC", "10"), 10),

    TELEGRAM_BOT_TOKEN: getEnv("TELEGRAM_BOT_TOKEN", "sabia-agent")
};
