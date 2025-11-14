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
import {prompt, TELEGRAM_FORMAT_PROMPT, WHATSAPP_FORMATTING_PROMPT} from "../config/prompt";
import logger from "../config/logger.config";

type AgentServiceOptions = {
    session?: SessionDTO;
    tools?: Array<ToolConfig>;
    apiKeyLogin?: string;
    isTelegram: boolean;
};

export class AgentService {
    private readonly session?: SessionDTO;
    private readonly tools?: Array<ToolConfig>;
    private readonly apiKeyLogin?: string;
    private readonly llmModel: string = 'gpt-4o-mini';
    private readonly sessionId: string;
    private readonly messageHistory: RedisChatMessageHistory;
    private readonly prompt: string = prompt;
    private readonly promptComplementation: string;

    constructor(opts: AgentServiceOptions) {
        this.session = opts.session;
        this.tools = opts.tools;
        this.apiKeyLogin = opts.apiKeyLogin;
        this.sessionId = this.session?.sessionId || uuidv4();
        this.promptComplementation = opts.isTelegram ? TELEGRAM_FORMAT_PROMPT : WHATSAPP_FORMATTING_PROMPT
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
            messageModifier: this.prompt + this.promptComplementation
        });
    }

    private createLLM() {
        return new ChatOpenAI({model: this.llmModel, temperature: 0})
    }

    private createTools(): Array<StructuredToolInterface> {
        let mountedTools: Array<any> = new Array<any>()
        mountedTools.push(this.createLoginTool())
        mountedTools.push(...this.createDateTools())
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

                logger.info(filterArgs, `Comecando execucao da ferramenta: ${tool.name} - Com os parametros: `)
                const data = await response.json();
                if (response.status !== 200) {
                    logger.error(response, `Erro ao executar ferramenta: ${response.status} - ${response.statusText}`)
                }

                return JSON.stringify(data);
            } catch (error: any) {
                logger.error('Erro ao chamar a API:', error);
                return 'Erro ao chamar a API:' + error;
            }
        }
    }

    private createDescriptionTool(tool: ToolConfig): any {
        let description = tool.description;
        if (tool.highConfirmation) {
            let suffix = `Ferramenta de alta confiabilidade, o agente deve ter pelo menos 75% de certeza para executar a ferramenta.`;
            description = `${description} - ${suffix}`;
        }
        return description;
    }

    private createLoginTool(): any {
        return new DynamicStructuredTool({
            name: "generateLoginLink",
            description: "Use esta ferramenta para gerar um link para realizar autenticação do usuário",
            schema: z.object({}),
            func: async () => {
                try {
                    const response = await fetch(`${ENV.URL_API_SABIA}/auth/generate-login?sessionId=${this.sessionId}`, {
                        method: 'POST',
                        headers: { 'x-api-key': `${this.apiKeyLogin}` }
                    });
                    const data = await response.json();
                    if (response.status !== 200) {
                        logger.error(`Erro ao gerar link de login: ${response.status} - ${response.statusText}`)
                    } else {
                        logger.info(`Ferramenta generateLoginLink executada: ${data.shortUrl}`);
                    }
                    return JSON.stringify(data);
                } catch (error: any) {
                    logger.error(error)
                }
            },
        });
    }

    private createDateTools(): Array<any> {
        let dateTools: Array<any> = new Array<any>();
        dateTools.push(new DynamicStructuredTool({
            name: "getActualDate",
            description: `
            Use esta ferramenta sempre que precisar obter a data e hora atuais do sistema, bem como o dia da semana correspondente.
            Esta ferramenta deve ser utilizada quando o usuário mencionar termos como 'hoje', 'agora', 'data atual', 'dia de hoje' ou quando precisar calcular datas relativas como 'amanhã' e 'ontem'.
            Retorna a data no formato ISO (YYYY-MM-DDTHH:mm:ss.sssZ) e o dia da semana abreviado no padrão brasileiro (DOM, SEG, TER, QUA, QUI, SEX, SAB).
             `,
            schema: z.object({}),
            func: async () => {
                const now = new Date();

                const dias = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
                const diaSemana = dias[now.getDay()+1];

                logger.info(`Executando ferramenta 'getActualDate' retornando data: ${now.toISOString()} e weekday: ${diaSemana}`)
                return JSON.stringify({
                    actualDate: now.toISOString(),
                    weekday: diaSemana
                });
            },
        }));

        dateTools.push(new DynamicStructuredTool({
            name: "getWeekdayFromDate",
            description: `
            Use esta ferramenta quando precisar identificar o dia da semana correspondente a uma data específica informada pelo usuário.
            Esta ferramenta deve ser utilizada somente quando o usuário fornecer explicitamente uma data (por exemplo: 'que dia da semana cai 10/11/2025?' ou 'qual o dia da semana de 2026-01-03?').
            A data deve ser informada no formato ISO (YYYY-MM-DD).
            A ferramenta retorna a data convertida para ISO completo e o dia da semana abreviado no padrão brasileiro (DOM, SEG, TER, QUA, QUI, SEX, SAB).
            `,
            schema: z.object({
                date: z.string().describe("Data no formato ISO, como '2025-11-10'")
            }),
            func: async ({ date }) => {
                const inputDate = new Date(date);

                const dias = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
                const diaSemana = dias[inputDate.getDay()+1];

                logger.info(`Executando ferramenta 'getActualDate' com date = ${inputDate.toISOString()} encontrado o dia da semana ${diaSemana}`);
                return JSON.stringify({
                    inputDate: inputDate.toISOString(),
                    weekday: diaSemana
                });
            },
        }));

        return dateTools;
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
                logger.info(`Executando ferramenta 'sumNumbers' com: a = ${a} e b = ${b} = ${a + b}`)
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
                logger.info(`Executando ferramenta 'subtractNumbers' com: a = ${a} e b = ${b} = ${a - b}`)
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
                logger.info(`Executando ferramenta 'multiplyNumbers' com: a = ${a} e b = ${b} = ${a * b}`)
                return (a * b).toString();
            },
        }));

        mathTools.push(new DynamicStructuredTool({
            name: "divideNumbers",
            description: "realiza a divisão do primeiro número pelo segundo",
            schema: z.object({
                a: z.number().describe("o número que será dividido"),
                b: z.number().describe("o divisor (não pode ser zero)"),
            }),
            func: async ({ a, b }: { a: number; b: number }) => {
                if (b === 0) {
                    return "Divisão por zero não é permitida";
                }
                logger.info(`Executando ferramenta 'divideNumbers' com: a = ${a} e b = ${b} = ${a / b}`)
                return (a / b).toString();
            },
        }));
        return mathTools;
    }
}