import { cosineSimilarity } from './math.js';
import { stringifyTurns } from './text.js';
import {turn} from "../agent/history";
import {Model} from "../models/model";

export class Examples {
    constructor(model: Model, select_num=2) {
        this.examples = [];
        this.model = model;
        this.select_num = select_num;
    }

    async load(examples) {
        this.examples = [];
        let promises = examples.map(async (example: string) => {
            let messages = '';
            for (let turn of example) {
                if (turn.role === 'user')
                    messages += turn.content.substring(turn.content.indexOf(':')+1).trim() + '\n';
            }
            messages = messages.trim();
            const embedding = await this.model.embed(messages);
            return {'embedding': embedding, 'turns': example};
        });
        this.examples = await Promise.all(promises);
    }

    async getRelevant(turns: turn[]) {
        let messages = '';
        for (let turn of turns) {
            if (turn.role != 'assistant')
                messages += turn.content.substring(turn.content.indexOf(':')+1).trim() + '\n';
        }
        messages = messages.trim();
        const embedding = await this.model.embed(messages);
        this.examples.sort((a, b) => {
            return cosineSimilarity(b.embedding, embedding) - cosineSimilarity(a.embedding, embedding);
        });
        let selected = this.examples.slice(0, this.select_num);
        return JSON.parse(JSON.stringify(selected)); // deep copy
    }

    async createExampleMessage(turns: turn[]) {
        let selected_examples = await this.getRelevant(turns);

        console.log('selected examples:');
        for (let example of selected_examples) {
            console.log(example.turns[0].content)
        }

        let msg = 'Examples of how to respond:\n';
        for (let i=0; i<selected_examples.length; i++) {
            let example = selected_examples[i];
            msg += `Example ${i+1}:\n${stringifyTurns(example.turns)}\n\n`;
        }
        return msg;
    }
}