import axios from "axios";
import crypto from "crypto";
import {URLSearchParams} from "url";
import {decodeJwt} from "jose";
import {saveAuthState, getAuthState, getSession, saveSession} from "./sessions.service";
import {ENV} from "../config/env.config";
import {SessionDTO} from "../model/session.dto";

export function makeUrlAuth(sessionId: string) {
    const codeVerifier = random(32);
    const codeChallenge = crypt(codeVerifier);
    const state = random(16);

    saveAuthState({state, codeVerifier, sessionId});

    const qParams = new URLSearchParams({
        client_id: ENV.OIDC_CLIENT_ID,
        response_type: "code",
        redirect_uri: ENV.OIDC_REDIRECT_URI,
        scope: "openid",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        state
    });

    return `${ENV.OIDC_ISSUER}/oauth2/authorize?${qParams.toString()}`;
}

export async function handleCallback(state: string, code: string) {
    const saved = await getAuthState(state);
    if (!saved) throw new Error("invalid_or_expired_state");

    const body = new URLSearchParams({
        grant_type: "authorization_code",
        redirect_uri: ENV.OIDC_REDIRECT_URI,
        code_verifier: saved.codeVerifier,
        code
    });

    const authHeader = "Basic " + Buffer.from(`${ENV.OIDC_CLIENT_ID}:${ENV.OIDC_CLIENT_SECRET}`).toString("base64");

    const {data} = await axios.post(`${ENV.OIDC_ISSUER}/oauth2/token`, body, {
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": authHeader
        }
    });

    const {access_token, refresh_token, expires_in} = data;
    const decoded: any = decodeJwt(access_token);
    const studentUuid: string = decoded.sub;
    const institutionId: string = decoded.institution_id;
    const expireIn = Date.now() + expires_in * 1000;

    const sess = await getSession(saved.sessionId);
    if (!sess) throw new Error("session_not_found");

    sess.studentUuid = studentUuid;
    sess.accessToken = access_token;
    sess.refreshToken = refresh_token;
    sess.expireIn = expireIn;
    sess.institutionId = institutionId;
    await saveSession(sess);

    return sess;
}

export async function refreshIfNeeded(sess: SessionDTO) {
    const soon = 30_000;
    if (!sess.refreshToken || !sess.expireIn) return;

    if (sess.expireIn - Date.now() > soon) return;

    const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: sess.refreshToken
    });

    const authHeader = "Basic " + Buffer.from(`${ENV.OIDC_CLIENT_ID}:${ENV.OIDC_CLIENT_SECRET}`).toString("base64");

    try {
        const {data} = await axios.post(`${ENV.OIDC_ISSUER}/oauth2/token`, body, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Authorization": authHeader
            }
        });

        const {access_token, refresh_token, expires_in} = data;
        const decoded: any = decodeJwt(access_token);

        sess["accessToken"] = access_token;
        sess["refreshToken"] = refresh_token || sess.refreshToken;
        sess["studentUuid"] = decoded.sub;
        sess["institutionId"] = decoded.institution_id;
        sess["expireIn"] = Date.now() + (expires_in * 1000);

        await saveSession(sess as any);
    } catch (e) {
        console.error(e);
    }
}

function random(n = 32) {
    return crypto.randomBytes(n).toString("base64url");
}

function crypt(s: string) {
    return crypto.createHash("sha256").update(s).digest("base64url");
}
