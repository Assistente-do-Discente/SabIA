import {NextFunction, Request, Response} from "express";
import {AgentService} from "../service/agent.service";
import { ToolConfig} from "../model/agent-config.dto";
import {MessageResponse} from "../model/message-response.dto";
import {SessionDTO} from "../model/session.dto";

export class AgentController {

    public handleMessage(req: Request, res: Response, next: NextFunction) {
        try {
            let message: any = req.body.message
            let tools: Array<ToolConfig> = (req as any).tools
            let session: SessionDTO = (req as any).session
            let apiKeyLogin: string = req.header('x-api-key') as string;
            let isTelegram: boolean = req.query.isTelegram == 'true';

            const agentService = new AgentService({session, tools, apiKeyLogin, isTelegram});

            agentService.handleMessage(message).then((result) => {
                const messageResponse = new MessageResponse(result.message, 200);
                res.status(messageResponse.statusCode).send({...messageResponse, sessionId: session.sessionId, logged: !!session?.accessToken});
            });

        } catch (error) {
            next(error)
        }
    }
}