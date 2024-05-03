import OpenAIApi from 'openai';
import {Model} from "./model";
import {turn} from "../agent/history";

export class GPT implements  Model {
    model_name: string; openai: OpenAIApi;
    constructor(model_name: string) {
        this.model_name = model_name;
        let openAiConfig = null;
        if (process.env.OPENAI_ORG_ID) {
            openAiConfig = {
                organization: process.env.OPENAI_ORG_ID,
                apiKey: process.env.OPENAI_API_KEY,
            };
        } 
        else if (process.env.OPENAI_API_KEY) {
            openAiConfig = {
                apiKey: process.env.OPENAI_API_KEY,
            };
        }
        else {
            throw new Error('OpenAI API key missing! Make sure you set your OPENAI_API_KEY environment variable.');
        }

        this.openai = new OpenAIApi(openAiConfig);
    }

    async sendRequest(turns: turn[], systemMessage: string, stop_seq='***'): Promise<string | null> {

        let messages: turn[] = [{'role': 'system', 'content': systemMessage}].concat(turns);

        let res: string | null = "";
        try {
            console.log('Awaiting openai api response...')
            console.log('Messages:', messages);
            let completion = await this.openai.chat.completions.create({
                model: this.model_name,
                messages: messages as any,
                stop: stop_seq,
            });
            if (completion.choices[0].finish_reason == 'length')
                throw new Error('Context length exceeded'); 
            console.log('Received.')
            res = completion.choices[0].message.content;
        }
        catch (err: any) {
            if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }
        return res;
    }

    async embed(text: string) {
        const embedding = await this.openai.embeddings.create({
            model: "text-embedding-ada-002",
            input: text,
            encoding_format: "float",
        });
        return embedding.data[0].embedding;
    }
}



