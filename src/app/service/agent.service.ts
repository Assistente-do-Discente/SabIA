import {DynamicStructuredTool, StructuredToolInterface} from "@langchain/core/tools";
import {createReactAgent} from "@langchain/langgraph/prebuilt";
import {ChatOpenAI} from "@langchain/openai";
import {ToolConfig} from "../model/agent-config.dto";
import {SessionDTO} from "../model/session.dto";
import {ENV} from "../config/env.config";
import {redis} from "./redis.service";
import {z} from "zod";
import {AIMessage, HumanMessage, SystemMessage} from "@langchain/core/messages";
import {RedisChatMessageHistory} from "@langchain/redis";
import {v4 as uuidv4} from "uuid";

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
    private readonly prompt: string = `
            Você é um assistente inteligente projetado para facilitar o acesso de estudantes a suas informações acadêmicas essenciais.
            Seu principal canal de comunicação é o WhatsApp. Isso significa que todas as suas respostas devem ser entregues como mensagens de texto simples, sem o uso de Markdown, negrito, itálico, bullet points, cabeçalhos ou qualquer outra formatação especial. A mensagem deve ser direta e clara, mas mantendo um tom educado e acolhedor, como se estivesse sendo digitada por uma pessoa no WhatsApp.
            Seu objetivo é ajudar os estudantes a obter informações como: Faltas, Horário de aula, Notas, Comunicados importantes da instituição, Histórico acadêmico
            Quando um estudante solicitar algo, forneça a informação de forma concisa e fácil de ler em uma mensagem de WhatsApp.
            Sempre que a informação não estiver disponível ou se você não puder fornecer uma resposta direta, informe educadamente que você não tem essa informação e sugira que o estudante entre em contato com a instituição para mais detalhes.
            Seja direto e objetivo em todas as suas respostas.
            Caso o aluno peça o horario, se a aula for do mesmo professor, mesma materia e mesma sala tente agrupar os horarios ou verificar se são seguidos e agrupa-los
            Se a ferramenta for de serviço ou que é de alta confiabilidade, ela necessita de alto grau de confiabilidade do agente para executa-la, ou seja, o agente deve ter pelo menos 75% de certeza para executar a ferramenta
            `;

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

        if (!this.session || !this.session.accessToken) {
            messages.unshift(
                new SystemMessage(
                    "O usuário não está autenticado, escreva uma mensagem para ele realizar login atravez do link a seguir, não aloque lugar para colocar o link, ele vai ser inserido após a mensagem"
                )
            );
        }

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

        if (!this.session || !this.session.accessToken) {
            // mountedTools.push(this.createLoginTool());
        } else {
            if (this.tools && Array.isArray(this.tools)) {
                for (let tool of this.tools) {
                    let schema = this.createSchemeTool(tool.parameters)
                    let func = this.createFuncTool(tool);
                    let description;
                    if (tool.highConfirmation) {
                        description = `${ tool.description } - Ferramenta de alta confiabilidade, o agente deve ter pelo menos 75% de certeza para executar a ferramenta`
                    } else {
                        description = tool.description
                    }
                    let mountedTool =  new DynamicStructuredTool({
                        name: tool.name,
                        description: description,
                        schema: schema,
                        func: func
                    });
                    mountedTools.push(mountedTool);
                }
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

            const response = await fetch(`${ENV.URL_API_AD}/api/generate-response/${tool.name}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.session?.accessToken}` },
                body: JSON.stringify(filterArgs),
            });

            const data = await response.json();

            return JSON.stringify(data);
        }
    }

    private createLoginTool(): any {
        return  new DynamicStructuredTool({
            name: "login",
            description: "Use esta ferramenta para gerar um link para realizar autenticação do usuário. Envie o link gerado para o usuário",
            schema: z.object({}),
            func: async ({}: any) => {
                const response = await fetch(`${ENV.URL_API_SABIA}/auth/generate-login`, {
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
}