import {Router} from "express";
import {AgentController} from "../controller/agent.controller";

const agentRouter = Router();
const agentController = new AgentController();

agentRouter.post("/message", agentController.handleMessage);

export { agentRouter };
