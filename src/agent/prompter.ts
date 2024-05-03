import { readFileSync, mkdirSync, writeFileSync} from 'fs';
import { Examples } from '../utils/examples.js';
import { getCommandDocs } from './commands/index.js';
import { getSkillDocs } from './library/index.js';
import { stringifyTurns } from '../utils/text.js';
import { getCommand } from './commands/index.js';

import { Gemini } from '../models/gemini.js';
import { GPT } from '../models/gpt.js';
import { Claude } from '../models/claude.js';
import { Local } from '../models/local.js';
import {Agent} from "./agent";
import {turn} from "./history";
import {Model} from "../models/model";

interface Prompts {
    name: string;
    model: string;
    conversing: string;
    coding: string;
    saving_memory: string;
    conversation_examples: turn[][]
    coding_examples: turn[][]
}
export class Prompter {
    prompts: Prompts; agent: Agent; model: Model; convo_examples!: Examples; coding_examples!: Examples
    constructor(agent: Agent, fp: string) {
        this.prompts = JSON.parse(readFileSync(fp, 'utf8'));
        let name = this.prompts.name;
        this.agent = agent;
        let model_name = this.prompts.model;
        mkdirSync(`./bots/${name}`, { recursive: true });
        try {
            writeFileSync(`./bots/${name}/last_profile.json`, JSON.stringify(this.prompts, null, 4));
            console.log("Copy profile saved.");
        } catch (err) {
            throw err;
        }


        if (model_name.includes('gemini'))
            this.model = new Gemini(model_name);
        else if (model_name.includes('gpt'))
            this.model = new GPT(model_name);
        else if (model_name.includes('claude'))
            this.model = new Claude(model_name);
        else
            throw new Error('Unknown model ' + model_name);
    }

    getName() {
        return this.prompts.name;
    }

    async initExamples() {
        console.log('Loading examples...')
        this.convo_examples = new Examples(this.model);
        await this.convo_examples.load(this.prompts.conversation_examples);
        this.coding_examples = new Examples(this.model);
        await this.coding_examples.load(this.prompts.coding_examples);
        console.log('Examples loaded.');
    }

    async replaceStrings(prompt: string, messages: turn[] | null, examples: Examples | null =null, prev_memory: string | null=null, to_summarize: turn[]=[]) {
        prompt = prompt.replaceAll('$NAME', this.agent.name);

        if (prompt.includes('$STATS')) {
            let stats = await getCommand('!stats').perform(this.agent);
            prompt = prompt.replaceAll('$STATS', stats);
        }
        if (prompt.includes('$INVENTORY')) {
            let inventory = await getCommand('!inventory').perform(this.agent);
            prompt = prompt.replaceAll('$INVENTORY', inventory);
        }
        if (prompt.includes('$COMMAND_DOCS'))
            prompt = prompt.replaceAll('$COMMAND_DOCS', getCommandDocs());
        if (prompt.includes('$CODE_DOCS'))
            prompt = prompt.replaceAll('$CODE_DOCS', getSkillDocs());
        if (prompt.includes('$EXAMPLES') && examples !== null)
            prompt = prompt.replaceAll('$EXAMPLES', await examples.createExampleMessage(messages?? []));
        if (prompt.includes('$MEMORY'))
            prompt = prompt.replaceAll('$MEMORY', prev_memory ? prev_memory : 'None.');
        if (prompt.includes('$TO_SUMMARIZE'))
            prompt = prompt.replaceAll('$TO_SUMMARIZE', stringifyTurns(to_summarize));

        // check if there are any remaining placeholders with syntax $<word>
        let remaining = prompt.match(/\$[A-Z_]+/g);
        if (remaining !== null) {
            console.warn('Unknown prompt placeholders:', remaining.join(', '));
        }
        return prompt;
    }

    async promptConvo(messages: turn[]) {
        let prompt = this.prompts.conversing;
        prompt = await this.replaceStrings(prompt, messages, this.convo_examples);
        return await this.model.sendRequest(messages, prompt);
    }

    async promptCoding(messages: turn[]) {
        let prompt = this.prompts.coding;
        prompt = await this.replaceStrings(prompt, messages, this.coding_examples);
        return await this.model.sendRequest(messages, prompt);
    }

    async promptMemSaving(prev_mem: string, to_summarize: turn[]) {
        let prompt = this.prompts.saving_memory;
        prompt = await this.replaceStrings(prompt, null, null, prev_mem, to_summarize);
        return await this.model.sendRequest([], prompt);
    }
}