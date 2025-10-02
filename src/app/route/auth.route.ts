import {Router} from "express";
import {createSession, getSession} from "../service/sessions.service";
import {handleCallback, makeUrlAuth} from "../service/oidc.service";
import {createShortLink} from "../service/shortlink.service";
import {UnauthorizedError} from "../model/api-error.dto";
import {ENV} from "../config/env.config";
import {SessionDTO} from "../model/session.dto";

export const authRouter = Router();

function requireApiKey(req: any, res: any, next: any) {
    const key = req.header("x-api-key");
    if (!ENV.API_KEY_LOGIN || key !== ENV.API_KEY_LOGIN) {
        throw new UnauthorizedError("API-Key não informada ou inválida!")
    }
    next();
}

authRouter.post("/generate-login", requireApiKey, async (_req, res, next) => {
    try {
        const sess: SessionDTO = (_req as any).session
        const loginUrl = makeUrlAuth(sess.sessionId);

        const id = await createShortLink(loginUrl);
        const shortUrl = `${ENV.URL_API_SABIA}/l/${id}`;

        res.json({shortUrl});
    } catch (e) {
        next(e);
    }
});

authRouter.get("/callback", async (req, res) => {
    const code = req.query.code as string;
    const state = req.query.state as string;

    try {
        await handleCallback(state, code);
        res.type("html").send(`Login concluído. Você já pode voltar ao WhatsApp!>`);
    } catch (e: any) {
        console.error(e);
    }
});

authRouter.get("/status", requireApiKey, async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) return res.json({loggedIn: false});
    const sess = await getSession(sessionId);
    res.json({loggedIn: !!(sess && sess.accessToken), studentUuid: sess?.studentUuid || null});
});
