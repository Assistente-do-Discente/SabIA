import { Router } from "express";
import { DefaultController } from "../controller/default.controller";

const defaultRouter = Router();
const defaultController = new DefaultController();

defaultRouter.get("/", defaultController.handle);

export { defaultRouter };
