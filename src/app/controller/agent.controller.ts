import {NextFunction, Request, Response} from "express";
import {AgentService} from "../service/agent.service";
import { ToolConfig} from "../model/agent-config.dto";
import {MessageResponse} from "../model/message-response.dto";

export class AgentController {

    public handleMessage(req: Request, res: Response, next: NextFunction) {
        try {
            let message: any = req.body.message
            let tools: Array<ToolConfig> = (req as any).tools
            let externalID: any = req.query.externalID

            AgentService.handleMessage(message, tools, externalID).then((result) => {
                let messageResponse = new MessageResponse(result.message, 200)
                res.status(messageResponse.statusCode).send(messageResponse)
            })
        } catch (error) {
            next(error)
        }
    }
}