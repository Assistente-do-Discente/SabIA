import {CachedTools} from "../model/agent-config.dto";
import * as dotenv from "dotenv";
dotenv.config();

const toolsCache: Map<string, CachedTools> = new Map()
const TTL = 60 * 60 * 1000

export default async function toolsMiddleware(req: any, res: any, next: any) {
    try {
        const externalID: string = req.query.externalID
        if (!externalID) {
            (req as any).tools = []
            return next()
        }

        const cacheEntry = toolsCache.get(externalID)

        if (cacheEntry && cacheEntry.expiresAt > Date.now()) {
            (req as any).tools = cacheEntry.tools
            return next()
        }

        const tools = await getToolsFromAD(externalID)
        toolsCache.set(externalID, {
            tools,
            expiresAt: Date.now() + TTL
        });

        (req as any).tools = tools

        next()
    } catch (error) {
        next()
    }
}

async function getToolsFromAD(externalID: string): Promise<any> {
    const urlAD = process.env.URL_API_AD || "http://localhost:8080/api";

    const response = await fetch(`${urlAD}/institutionInformationsTools?externalID=${externalID}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });

    return await response.json()
}