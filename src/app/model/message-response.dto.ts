export class MessageResponse {
    public readonly statusCode: number
    public readonly message: string

    constructor(message: string, statusCode: number) {
        this.message = message
        this.statusCode = statusCode
    }
}