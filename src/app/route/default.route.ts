import { Router } from "express";
import { DefaultController } from "../controller/default.controller";
import {ENV} from "../config/env.config";

const defaultRouter = Router();
const defaultController = new DefaultController();

defaultRouter.get("/", defaultController.handle);

defaultRouter.get('/redirect-bot', (req, res) => {
    res.redirect(ENV.URL_BOT);
});

export { defaultRouter };
