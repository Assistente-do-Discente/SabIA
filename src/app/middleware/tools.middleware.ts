import {ToolConfig} from "../model/agent-config.dto";
import * as dotenv from "dotenv";
import {ENV} from "../config/env.config";
import {SessionDTO} from "../model/session.dto";
import {addDataRedis, getDataRedis, key} from "../service/redis.service";

dotenv.config();

export default async function toolsMiddleware(req: any, res: any, next: any) {
    try {
        const session: SessionDTO = (req as any).session
        if (!session || !session.sessionId) {
            (req as any).tools = []
            return next()
        }

        (req as any).tools = []

        await getDataRedis<ToolConfig>(session.institutionId || session.sessionId).then(async (result) => {
            if (result) {
                (req as any).tools = result || []
            } else {
                let tools = await getToolsFromAD(session);
                if (!tools) return next();

                (req as any).tools = tools || [];
                await addDataRedis(key.tools(session.institutionId || session.sessionId), tools, ENV.TOOLS_TTL_SEC)
            }
        })

        next()
    } catch (error) {
        next()
    }
}

async function getToolsFromAD(session: SessionDTO): Promise<any> {
    const response = await fetch(`${ENV.URL_API_AD}/api/institutionInformationsTools`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.accessToken}` },
    });
    return await response.json()
}