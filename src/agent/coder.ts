import { writeFile, readFile, mkdirSync } from 'fs';
import {Agent} from "./agent";
import {History} from "./history";
import {error} from "mineflayer-collectblock/lib/Util";
import {Bot} from "mineflayer";
import {AgentBot} from "./agent-bot";

interface CodingResult {
    success: boolean;
    message: string | null;
    interrupted: boolean;
    timedout: boolean;
}
export class Coder {
    agent: Agent; file_counter: number; fp: string; executing: boolean; generating: boolean; code_template: string; timedout: boolean; resume_func: any;
    constructor(agent: Agent) {
        this.agent = agent;
        this.file_counter = 0;
        this.fp = '/bots/'+agent.name+'/action-code/';
        this.executing = false;
        this.generating = false;
        this.code_template = '';
        this.timedout = false;

        readFile('./bots/template.js', 'utf8', (err, data) => {
            if (err) throw err;
            this.code_template = data;
        });

        mkdirSync('.' + this.fp, { recursive: true });
    }
    // write custom code to file and import it
    async stageCode(code: string) {
        code = this.sanitizeCode(code);
        let src = '';
        code = code.replace('console.log(', 'log(bot,');
        code = code.replace('log("', 'log(bot,"');

        // this may cause problems in callback functions
        code = code.replace(';\n', '; if(bot.interrupt_code) {log(bot, "Code interrupted.");return;}\n');
        for (let line of code.split('\n')) {
            src += `    ${line}\n`;
        }
        src = this.code_template.replace('/* CODE HERE */', src);

        console.log("writing to file...", src)

        let filename = this.file_counter + '.js';
        // if (this.file_counter > 0) {
        //     let prev_filename = this.fp + (this.file_counter-1) + '.js';
        //     unlink(prev_filename, (err) => {
        //         console.log("deleted file " + prev_filename);
        //         if (err) console.error(err);
        //     });
        // } commented for now, useful to keep files for debugging
        this.file_counter++;

        this.writeFilePromise('.' + this.fp + filename, src).catch(() => {
            console.error('Error writing code execution file: ' + error);
            return null;
        })

        return await import('../..' + this.fp + filename);
    }

    sanitizeCode(code: string) {
        code = code.trim();
        const remove_strs = ['Javascript', 'javascript', 'js']
        for (let r of remove_strs) {
            if (code.startsWith(r)) {
                code = code.slice(r.length);
                return code;
            }
        }
        return code;
    }

    writeFilePromise(filename: string, src: string) {
        // makes it so we can await this function
        return new Promise<void>((resolve, reject) => {
            writeFile(filename, src, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async generateCode(agent_history: History): Promise<string | null> {
        // wrapper to prevent overlapping code generation loops
        await this.stop();
        this.generating = true;
        let res: CodingResult = await this.generateCodeLoop(agent_history);
        this.generating = false;
        if (!res.interrupted) this.agent.agentBot.emit('idle');
        return res.message;
    }

    async generateCodeLoop(agent_history: History): Promise<CodingResult> {
        let messages = agent_history.getHistory();

        let code_return = null;
        let failures = 0;
        const interrupt_return: CodingResult = {success: true, message: null, interrupted: true, timedout: false};
        for (let i=0; i<5; i++) {
            if (this.agent.agentBot.interrupt_code)
                return interrupt_return;
            console.log(messages)
            let res = await this.agent.prompter.promptCoding(messages);
            if (this.agent.agentBot.interrupt_code)
                return interrupt_return;
            let contains_code = res.indexOf('```') !== -1;
            if (!contains_code) {
                if (res.indexOf('!newAction') !== -1) {
                    messages.push({
                        role: 'assistant',
                        content: res.substring(0, res.indexOf('!newAction'))
                    });
                    continue; // using newaction will continue the loop
                }

                if (code_return) {
                    await agent_history.add('system', code_return.message);
                    await agent_history.add(this.agent.name, res);
                    this.agent.agentBot.bot.chat(res);
                    return {success: true, message: null, interrupted: false, timedout: false};
                }
                if (failures >= 1) {
                    return {success: false, message: 'Action failed, agent would not write code.', interrupted: false, timedout: false};
                }
                messages.push({
                    role: 'system',
                    content: 'Error: no code provided. Write code in codeblock in your response. ``` // example ```'}
                );
                failures++;
                continue;
            }
            let code = res.substring(res.indexOf('```')+3, res.lastIndexOf('```'));

            const execution_file = await this.stageCode(code);
            if (!execution_file) {
                await agent_history.add('system', 'Failed to stage code, something is wrong.');
                return {success: false, message: null, interrupted: false, timedout: false};
            }
            code_return = await this.execute(async ()=>{
                return await execution_file.main(this.agent.agentBot);
            });

            if (code_return.interrupted && !code_return.timedout)
                return {success: false, message: null, interrupted: true, timedout: false};
            console.log("Code generation result:", code_return.success, code_return.message);

            messages.push({
                role: 'assistant',
                content: res
            });
            messages.push({
                role: 'system',
                content: code_return.message
            });
        }
        return {success: false, message: null, interrupted: false, timedout: true};
    }

    async executeResume(func=null, name=null, timeout=10): Promise<CodingResult> {
        if (func != null) {
            this.resume_func = func;
            this.resume_name = name;
        }
        if (this.resume_func != null && this.agent.isIdle()) {
            console.log('resuming code...')
            this.interruptible = true;
            let res = await this.execute(this.resume_func, timeout);
            this.interruptible = false;
            return res;
        } else {
            return {success: false, message: null, interrupted: false, timedout: false};
        }
    }

    cancelResume() {
        this.resume_func = null;
        this.resume_name = null;
    }

    // returns {success: bool, message: string, interrupted: bool, timedout: false}
    async execute(toExecute: () => Promise<any>, timeout=10): Promise<CodingResult> {
        if (!this.code_template) return {success: false, message: "Code template not loaded.", interrupted: false, timedout: false};

        let TIMEOUT;
        try {
            console.log('executing code...\n');
            await this.stop();
            this.clear();

            this.executing = true;
            if (timeout > 0)
                TIMEOUT = this._startTimeout(timeout);
            await toExecute(); // open fire
            this.executing = false;
            clearTimeout(TIMEOUT);

            let output = this.formatOutput(this.agent.agentBot);
            let interrupted = this.agent.agentBot.interrupt_code;
            let timedout = this.timedout;
            this.clear();
            if (!interrupted && !this.generating) this.agent.agentBot.emit('idle');
            return {success:true, message: output, interrupted, timedout};
        } catch (err) {
            this.executing = false;
            clearTimeout(TIMEOUT);
            this.cancelResume();
            console.error("Code execution triggered catch: " + err);
            await this.stop();

            let message = this.formatOutput(this.agent.agentBot) + '!!Code threw exception!!  Error: ' + err;
            let interrupted = this.agent.agentBot.interrupt_code;
            this.clear();
            if (!interrupted && !this.generating) this.agent.agentBot.emit('idle');
            return {success: false, message, interrupted, timedout: false};
        }
    }

    formatOutput(agentBot: AgentBot) {
        if (agentBot.interrupt_code && !this.timedout) return '';
        let output = agentBot.output;
        const MAX_OUT = 500;
        if (output.length > MAX_OUT) {
            output = `Code output is very long (${output.length} chars) and has been shortened.\n
                First outputs:\n${output.substring(0, MAX_OUT/2)}\n...skipping many lines.\nFinal outputs:\n ${output.substring(output.length - MAX_OUT/2)}`;
        }
        else {
            output = 'Code output:\n' + output;
        }
        return output;
    }

    async stop() {
        if (!this.executing) return;
        const start = Date.now();
        while (this.executing) {
            this.agent.agentBot.interrupt_code = true;
            void this.agent.agentBot.bot.collectBlock.cancelTask();
            this.agent.agentBot.bot.pathfinder.stop();
            void this.agent.agentBot.bot.pvp.stop();
            console.log('waiting for code to finish executing...');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (Date.now() - start > 10 * 1000) {
                process.exit(1); // force exit program after 10 seconds of failing to stop
            }
        }
    }

    clear() {
        this.agent.agentBot.output = '';
        this.agent.agentBot.interrupt_code = false;
        this.timedout = false;
    }

    _startTimeout(TIMEOUT_MINS=10) {
        return setTimeout(async () => {
            console.warn(`Code execution timed out after ${TIMEOUT_MINS} minutes. Attempting force stop.`);
            this.timedout = true;
            this.agent.agentBot.output += `\nAction performed for ${TIMEOUT_MINS} minutes and then timed out and stopped. You may want to continue or do something else.`;
            this.stop(); // last attempt to stop
            await new Promise(resolve => setTimeout(resolve, 5 * 1000)); // wait 5 seconds
            if (this.executing) {
                console.error(`Failed to stop. Killing process. Goodbye.`);
                this.agent.agentBot.output += `\nForce stop failed! Process was killed and will be restarted. Goodbye world.`;
                this.agent.agentBot.bot.chat('Goodbye world.');
                let output = this.formatOutput(this.agent.agentBot);
                this.agent.history.add('system', output);
                this.agent.history.save();
                process.exit(1); // force exit program
            }
            console.log('Code execution stopped successfully.');
        }, TIMEOUT_MINS*60*1000);
    }
}