import {ToolConfig} from "../model/agent-config.dto";
import * as dotenv from "dotenv";
import {ENV} from "../config/env.config";
import {SessionDTO} from "../model/session.dto";
import {addDataRedis, getDataRedis, key} from "../service/redis.service";
import logger from "../config/logger.config";

dotenv.config();

export default async function toolsMiddleware(req: any, res: any, next: any) {
    try {
        (req as any).tools = [];

        const session: SessionDTO = (req as any).session;
        if (!session || !session.sessionId) {
            return next();
        }

        const cacheKey = key.tools(session.institutionId || session.sessionId);
        logger.info(`Obtendo ferramentas para a chave: ${cacheKey}`);
        let result = await getDataRedis<ToolConfig>(cacheKey);

        if (!result) {
            if (session.accessToken) {
                result = await getInstitutionTools(session);
            } else {
                result = await getInformationTools();
            }

            if (result) {
                logger.info(`Adicionando ferramentas no redis: ${Array.isArray(result) ? result.length : "Não é uma lista"}`);
                await addDataRedis(cacheKey, result, ENV.TOOLS_TTL_SEC);
            }
        }

        logger.info(`Ferramentas encontradas para processamento: ${Array.isArray(result) ? result.length : "Não é uma lista"}`);
        (req as any).tools = result || [];

        next();
    } catch (error) {
        logger.error(`Erro ao realizar busca de ferramentas: ${ error }`)
        next()
    }
}

async function getInstitutionTools(session: SessionDTO): Promise<any> {
    const response = await fetch(`${ENV.URL_API_AD}/api/institutionTools`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.accessToken}` },
    });
    let data = await response.json();
    return data;
}

async function getInformationTools(): Promise<any> {
    const response = await fetch(`${ENV.URL_API_AD}/api/informationTools`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });
    let data = await response.json();
    return data;
}