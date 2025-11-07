import {addDataRedis, getDataRedis, delDataRedis, key} from "./redis.service";
import { AuthState, SessionDTO } from "../model/session.dto";
import { ENV } from "../config/env.config";
import { v4 as uuidv4 } from "uuid";

export async function createSession(chatId?: string): Promise<SessionDTO> {
    let sessionId;
    if (chatId) {
        sessionId = `${chatId}`;
    } else {
        sessionId = `sess_${uuidv4()}`;
    }
    const sessionData: SessionDTO = { sessionId, createdAt: Date.now(), updatedAt: Date.now() };
    await addDataRedis(key.session(sessionId), sessionData, ENV.SESSION_TTL_SEC);
    return sessionData;
}

export async function getSession(sessionId: string) {
    return getDataRedis<SessionDTO>(key.session(sessionId));
}

export async function saveSession(data: SessionDTO) {
    data.updatedAt = Date.now();
    await addDataRedis(key.session(data.sessionId), data, ENV.SESSION_TTL_SEC);
}

export async function deleteSession(sessionId: string) {
    await delDataRedis(key.session(sessionId));
}

export async function saveAuthState(s: AuthState) {
    await addDataRedis(key.state(s.state), s, ENV.STATE_TTL_SEC);
}

export async function getAuthState(state: string): Promise<AuthState | null> {
    const stateKey = key.state(state);
    const stateData = await getDataRedis<AuthState>(stateKey);
    if (stateData)
        await delDataRedis(stateKey);
    return stateData;
}
