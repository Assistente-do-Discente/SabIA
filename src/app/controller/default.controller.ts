import { Request, Response } from "express";
import { defaultService } from "../service/default.service";

export class DefaultController {
  public handle(req: Request, res: Response) {
    const serviceResponse = defaultService.handle();

    res.status(200).send(serviceResponse);
  }
}
