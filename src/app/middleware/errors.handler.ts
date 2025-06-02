import {NextFunction, Request, Response} from 'express'
import {MessageResponse} from "../model/message-response.dto";

export default async function errorsHandler (error: any, req: Request, res: Response, next: NextFunction) {
    const statusCode = error.statusCode ?? 500
    const message = error.message ? error.message : 'Internal Server Error'

    console.log(error)

    let messageResponse = new MessageResponse(message, statusCode)
    return res.status(400).json(messageResponse)
}