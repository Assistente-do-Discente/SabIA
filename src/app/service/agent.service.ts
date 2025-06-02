import {ToolConfig} from "../model/agent-config.dto";
import {z} from "zod";
import {DynamicStructuredTool} from "@langchain/core/tools";
import {createReactAgent} from "@langchain/langgraph/prebuilt";
import {ChatOpenAI} from "@langchain/openai";
import * as dotenv from "dotenv";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";
import {pool} from "../../main";
import {StructuredToolInterface} from "@langchain/core/dist/tools";
import {v4 as uuidv4} from 'uuid';

dotenv.config();

export class AgentService {
    static readonly urlAD = process.env.URL_API_AD || "http://localhost:8080/api";

    public static async handleMessage(message: string, tools: Array<ToolConfig>, externalID: string) {
        let agent = await this.createAgent(tools, externalID)

        return { message: await this.processMessage(agent, message, externalID) }
    }

    private static async processMessage(agent: any, message: string, externalID: string) {
        const config = { configurable: { thread_id: externalID || uuidv4() } };

        let messages = [{
            role: "user",
            content: message
        }];

        if (!externalID) {
            messages.push({
                role: "system",
                content: "O usuário não está autenticado, por favor peça para ele se autenticar, acessando o link: " + this.urlAD
            })
        }

        let agentOutput = await agent.invoke({ messages: messages}, config);

        return agentOutput.messages[agentOutput.messages.length - 1].content;
    }

    private static async createAgent(tools: Array<ToolConfig>, externalID: string) {
        const checkpointer = new PostgresSaver(pool);
        await checkpointer.setup();

        let prompt = `
            Você é um assistente inteligente projetado para facilitar o acesso de estudantes a suas informações acadêmicas essenciais.
            Seu principal canal de comunicação é o WhatsApp. Isso significa que todas as suas respostas devem ser entregues como mensagens de texto simples, sem o uso de Markdown, negrito, itálico, bullet points, cabeçalhos ou qualquer outra formatação especial. A mensagem deve ser direta e clara, mas mantendo um tom educado e acolhedor, como se estivesse sendo digitada por uma pessoa no WhatsApp.
            Seu objetivo é ajudar os estudantes a obter informações como: Faltas, Horário de aula, Notas, Comunicados importantes da instituição, Histórico acadêmico
            Quando um estudante solicitar algo, forneça a informação de forma concisa e fácil de ler em uma mensagem de WhatsApp.
            Sempre que a informação não estiver disponível ou se você não puder fornecer uma resposta direta, informe educadamente que você não tem essa informação e sugira que o estudante entre em contato com a instituição para mais detalhes.
            Seja direto e objetivo em todas as suas respostas.
            `;

        return createReactAgent({
            llm: this.createLLM(),
            tools: this.createTools(tools, externalID),
            checkpointSaver: checkpointer,
            messageModifier: prompt
        });
    }

    private static createLLM() {
        return new ChatOpenAI( {model: 'gpt-4o-mini', temperature: 0} )
    }

    private static createTools(tools: Array<ToolConfig>, externalID: string): Array<StructuredToolInterface> {
        let mountedTools: Array<any> = new Array<any>()

        if (tools) {
            for (let tool of tools) {
                let mountedTool = this.createDynamicTool(tool, externalID);
                mountedTools.push(mountedTool);
            }
        }

        return mountedTools;
    }

    private static createDynamicTool(tool: ToolConfig, externalID: string): any {
        let schema = this.createSchemeTool(tool.parameters)
        let func = this.createFuncTool(tool, externalID);
        return new DynamicStructuredTool({
            name: tool.name,
            description: tool.description,
            schema: schema,
            func: func
        });
    }

    private static createSchemeTool(parameters: any): any {
        return !parameters ? z.object({}) : z.object(
            Object.keys(parameters).reduce((acc, key) => {
                const param = parameters[key];
                let parameterZod: z.ZodType;

                switch (param.clazz.toUpperCase()) {
                    case 'NUMBER': parameterZod = z.number().describe(param.description); break;
                    case 'STRING':  parameterZod = z.string().describe(param.description); break;
                    case 'BOOLEAN': parameterZod = z.boolean().describe(param.description); break;
                    case 'ENUM': parameterZod = z.enum(param.possibleValues).describe(param.description); break;
                    case 'NULL': parameterZod = z.null(); break;
                    default: {
                        console.log(`Tipo de parâmetro não suportado: ${param.clazz}`);
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

    private static createFuncTool(tool: ToolConfig, externalID: string): any {
        return async (args: any): Promise<string> => {
            const filterArgs = Object.fromEntries(
                Object.entries(args).filter(([_, value]) => value !== undefined)
            );

            const response = await fetch(`${this.urlAD}/generate-response/${tool.name}?externalID=${externalID}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(filterArgs),
            });

            const data = await response.json();

            return JSON.stringify(data);
        }
    }
}