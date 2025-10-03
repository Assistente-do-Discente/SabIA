import {DynamicStructuredTool, StructuredToolInterface} from "@langchain/core/tools";
import {createReactAgent} from "@langchain/langgraph/prebuilt";
import {ChatOpenAI} from "@langchain/openai";
import {ToolConfig} from "../model/agent-config.dto";
import {SessionDTO} from "../model/session.dto";
import {ENV} from "../config/env.config";
import {redis} from "./redis.service";
import {z} from "zod";
import {AIMessage, HumanMessage} from "@langchain/core/messages";
import {RedisChatMessageHistory} from "@langchain/redis";
import {v4 as uuidv4} from "uuid";
import {prompt} from "../config/prompt";

type AgentServiceOptions = {
    session?: SessionDTO;
    tools?: Array<ToolConfig>;
    apiKeyLogin?: string;
};

export class AgentService {
    private readonly session?: SessionDTO;
    private readonly tools?: Array<ToolConfig>;
    private readonly apiKeyLogin?: string;
    private readonly llmModel: string = 'gpt-4o-mini';
    private readonly sessionId: string;
    private readonly messageHistory: RedisChatMessageHistory;
    private readonly prompt: string = prompt;

    constructor(opts: AgentServiceOptions) {
        this.session = opts.session;
        this.tools = opts.tools;
        this.apiKeyLogin = opts.apiKeyLogin;
        this.sessionId = this.session?.sessionId || uuidv4();
        this.messageHistory = new RedisChatMessageHistory({
            sessionId: this.sessionId,
            sessionTTL: ENV.AGENT_TTL_SEC,
            client: redis,
        });
    }

    public async handleMessage(message: string) {
        let agent = await this.createAgent();

        return { message: await this.processMessage(agent, message) }
    }

    private async processMessage(agent: any, message: string) {
        const history = await this.messageHistory.getMessages();
        let messages = [...history, new HumanMessage(message)];

        const agentOutput = await agent.invoke(
            { messages: messages },
            { configurable: { thread_id: this.sessionId, sessionId: this.sessionId } }
        );

        const lastMessage = agentOutput.messages[agentOutput.messages.length - 1];

        await this.messageHistory.addMessage(new HumanMessage(message));
        await this.messageHistory.addMessage(new AIMessage(lastMessage.content as string));

        return lastMessage.content;
    }

    private async createAgent() {
        return createReactAgent({
            llm: this.createLLM(),
            tools: this.createTools(),
            messageModifier: this.prompt
        });
    }

    private createLLM() {
        return new ChatOpenAI({model: this.llmModel, temperature: 0})
    }

    private createTools(): Array<StructuredToolInterface> {
        let mountedTools: Array<any> = new Array<any>()
        mountedTools.push(this.createDateTool())
        mountedTools.push(this.createLoginTool())
        mountedTools.push(...this.createMathTools())

        if (this.tools && Array.isArray(this.tools)) {
            for (let tool of this.tools) {
                let schema = this.createSchemeTool(tool.parameters)
                let func = this.createFuncTool(tool);
                let description = this.createDescriptionTool(tool)
                let mountedTool =  new DynamicStructuredTool({
                    name: tool.name,
                    description: description,
                    schema: schema,
                    func: func
                });
                mountedTools.push(mountedTool);
            }
        }

        return mountedTools;
    }

    private createSchemeTool(parameters: any): any {
        return !parameters ? z.object({}) : z.object(
            Object.keys(parameters).reduce((acc, key) => {
                const param = parameters[key];
                let parameterZod: z.ZodType;

                switch (param.clazz?.toUpperCase()) {
                    case 'NUMBER': parameterZod = z.number().describe(param.description); break;
                    case 'STRING':  parameterZod = z.string().describe(param.description); break;
                    case 'BOOLEAN': parameterZod = z.boolean().describe(param.description); break;
                    case 'ENUM': parameterZod = z.enum(param.possibleValues).describe(param.description); break;
                    case 'NULL': parameterZod = z.null(); break;
                    default: {
                        parameterZod = z.null(); break;
                    }
                }

                switch (param.type) {
                    case 'OPTIONAL': acc[key] = parameterZod.optional().nullable(); break;
                    case 'MANDATORY': acc[key] = parameterZod; break;
                    default: break;
                }

                return acc;
            }, {} as Record<string, z.ZodType>)
        );
    }

    private createFuncTool(tool: ToolConfig): any {
        return async (args: any): Promise<string> => {
            const filterArgs = Object.fromEntries(
                Object.entries(args).filter(([_, value]) => value !== undefined)
            );

            try {
                const headers: Record<string, string> = { "Content-Type": "application/json" };
                if (this.session?.accessToken) {
                    headers["Authorization"] = `Bearer ${this.session.accessToken}`;
                }
                const response = await fetch(`${ENV.URL_API_AD}/api/generate-response/${tool.name}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(filterArgs),
                });

                const data = await response.json();

                return JSON.stringify(data);
            } catch (error: any) {
                console.error('Erro ao chamar a API:', error);
                return 'Erro ao chamar a API:' + error;
            }
        }
    }

    private createDescriptionTool(tool: ToolConfig): any {
        let description = tool.description;
        let suffix: string;
        if (tool.highConfirmation) {
            suffix = `Ferramenta de alta confiabilidade, o agente deve ter pelo menos 75% de certeza para executar a ferramenta.`;
        } else {
            suffix = tool.authenticationRequired ? 'Ferramenta necessita de autenticação.' : 'Ferramenta não necessita de autenticação.';
        }
        if (suffix) {
            description = `${description} - ${suffix}`;
        }
        return description;
    }

    private createLoginTool(): any {
        return new DynamicStructuredTool({
            name: "login",
            description: "Use esta ferramenta para gerar um link para realizar autenticação do usuário, pegue o link retornado da função e monte a mensagem para o usuário",
            schema: z.object({}),
            func: async () => {
                const response = await fetch(`${ENV.URL_API_SABIA}/auth/generate-login?sessionId=${this.sessionId}`, {
                    method: 'POST',
                    headers: { 'x-api-key': `${this.apiKeyLogin}` }
                });
                const data = await response.json();
                return JSON.stringify(data);
            },
        });
    }

    private createDateTool(): any {
        return  new DynamicStructuredTool({
            name: "getActualDate",
            description: "Utilize essa ferramanta para quando precisar saber qual a data e hora atual.",
            schema: z.object({}),
            func: async ({}: any) => {
                return JSON.stringify({ actualDate: new Date().toISOString() });
            },
        });
    }

    private createMathTools(): Array<any> {
        let mathTools: Array<any> = new Array<any>();
        mathTools.push(new DynamicStructuredTool({
            name: "sumNumbers",
            description: "soma dois números",
            schema: z.object({
                a: z.number().describe("o primeiro número a somar"),
                b: z.number().describe("o segundo número a somar"),
            }),
            func: async ({ a, b }: { a: number; b: number }) => {
                return (a + b).toString();
            },
        }));

        mathTools.push(new DynamicStructuredTool({
            name: "subtractNumbers",
            description: "subtrai o segundo número do primeiro",
            schema: z.object({
                a: z.number().describe("o número de onde será subtraído"),
                b: z.number().describe("o número que será subtraído"),
            }),
            func: async ({ a, b }: { a: number; b: number }) => {
                return (a - b).toString();
            },
        }));

        mathTools.push(new DynamicStructuredTool({
            name: "multiplyNumbers",
            description: "multiplica dois números",
            schema: z.object({
                a: z.number().describe("o primeiro número a multiplicar"),
                b: z.number().describe("o segundo número a multiplicar"),
            }),
            func: async ({ a, b }: { a: number; b: number }) => {
                return (a * b).toString();
            },
        }));

        mathTools.push(new DynamicStructuredTool({
            name: "divideNumbers",
            description: "divide o primeiro número pelo segundo",
            schema: z.object({
                a: z.number().describe("o número que será dividido"),
                b: z.number().describe("o divisor (não pode ser zero)"),
            }),
            func: async ({ a, b }: { a: number; b: number }) => {
                if (b === 0) {
                    return "Divisão por zero não é permitida";
                }
                return (a / b).toString();
            },
        }));
        return mathTools;
    }
}