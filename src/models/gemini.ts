import {GenerativeModel, GoogleGenerativeAI} from '@google/generative-ai';
import {turn} from "../agent/history";
import {Model} from "./model";

export class Gemini implements Model{
    model_name: string; genAI: GoogleGenerativeAI; llmModel: GenerativeModel; embedModel: GenerativeModel
    constructor(model_name: string) {
        this.model_name = model_name;
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('Gemini API key missing! Make sure you set your GEMINI_API_KEY environment variable.');
        }
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        

        this.llmModel = this.genAI.getGenerativeModel({ model: model_name });
        this.embedModel = this.genAI.getGenerativeModel({ model: "embedding-001"});
    }

    async sendRequest(turns: turn[], systemMessage: string) {
        const messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
        let prompt = "";
        let role = "";
        messages.forEach((message) => {
            role = message.role;
            if (role === 'assistant') role = 'model';
            prompt += `${role}: ${message.content}\n`;
        });
        if (role !== "model") // if the last message was from the user/system, add a prompt for the model. otherwise, pretend we are extending the model's own message
            prompt += "model: ";
        console.log(prompt)
        const result = await this.llmModel.generateContent(prompt);
        const response = await result.response;
        return response.text();
    }

    async embed(text: string) {
        const result = await this.embedModel.embedContent(text);
        return result.embedding.values;
    }
}