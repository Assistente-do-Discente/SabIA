import {getSession} from "../service/sessions.service";
import {refreshIfNeeded} from "../service/oidc.service";

export default async function sessionMiddleware(req: any, res: any, next: any) {
    const sessionId = (req.query.sessionId) as string;

    if (sessionId) {
        const session = await getSession(sessionId);
        if (session) {
            await refreshIfNeeded(session);
            (req as any).session = session;
        }
    }

    next();

}