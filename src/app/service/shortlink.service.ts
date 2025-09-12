import {addDataRedis, delDataRedis, getDataRedis, key} from "./redis.service";
import {ENV} from "../config/env.config";

export async function createShortLink(longUrl: string): Promise<string> {
    const id = randomId(12);
    await addDataRedis(key.shortLink(id), longUrl, ENV.SHORTLINK_TTL_SEC);
    return id;
}

export async function resolveShortLink(id: string): Promise<string | null> {
    let longUrl = await getDataRedis<string>(key.shortLink(id));
    if (!longUrl)
        return null;

    return longUrl;
}

export async function deleteShortLink(id: string) {
    await delDataRedis(key.shortLink(id));
}

function randomId(len = 8) {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let out = "";
    for (let i = 0; i < len; i++) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
}