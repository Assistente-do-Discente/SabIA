import {createClient} from "redis";
import {ENV} from "../config/env.config";

export const key = {
    state: (state: string) => `auth_state:${state}`,
    session: (sid: string) => `session:${sid}`,
    shortLink: (id: string) => `short_link:${id}`,
    tools: (id: string) => `tools:${id}`,
};

export const redis = createClient({ url: ENV.URL_REDIS });

redis.on("error", (err) => console.error("[redis] error:", err));

export async function initRedis() {
    if (!redis.isOpen) await redis.connect();
}

export async function addDataRedis(key: string, value: any, ttlSec?: number) {
    const payload = JSON.stringify(value);
    if (ttlSec && ttlSec > 0) {
        await redis.set(key, payload, {EX: ttlSec});
    } else {
        await redis.set(key, payload);
    }
}

export async function getDataRedis<T = any>(key: string): Promise<T | null> {
    const s = await redis.get(key);
    return s ? (JSON.parse(s) as T) : null;
}

export async function delDataRedis(key: string) {
    await redis.del(key);
}
