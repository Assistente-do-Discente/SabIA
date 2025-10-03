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

        await getDataRedis<ToolConfig>(key.tools(session.institutionId || session.sessionId)).then(async (result) => {
            if (result) {
                (req as any).tools = result || []
            } else {
                let tools;

                if (session.accessToken) {
                    tools = await getInstitutionTools(session);
                } else {
                    tools = await getInformationTools();
                }

                if (!tools) return next();

                (req as any).tools = tools || [];
                await addDataRedis(key.tools(session.institutionId || session.sessionId), tools, ENV.TOOLS_TTL_SEC)
            }
        })

        next()
    } catch (error) {
        console.error(error)
        next()
    }
}

async function getInstitutionTools(session: SessionDTO): Promise<any> {
    const response = await fetch(`${ENV.URL_API_AD}/api/institutionTools`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.accessToken}` },
    });
    return await response.json()
}

async function getInformationTools(): Promise<any> {
    const response = await fetch(`${ENV.URL_API_AD}/api/informationTools`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });
    return await response.json()
}