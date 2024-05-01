import { History } from './history.js';
import { Coder } from './coder.js';
import { Prompter } from './prompter.js';
import { containsCommand, commandExists, executeCommand, truncCommandMessage } from './commands';
import {AgentBot} from "./agent-bot";


export class Agent  {
    prompter!: Prompter; name!: string; history!: History; coder!: Coder; agentBot!: AgentBot;
    async start(profile_fp: string, load_mem: boolean=false, init_message:string = ""): Promise<void> {
        this.prompter = new Prompter(this, profile_fp);
        this.name = this.prompter.getName();
        this.history = new History(this);
        this.coder = new Coder(this);
        await this.prompter.initExamples();

        if (load_mem)
            this.history.load();

        console.log('Logging in...');
        this.agentBot = new AgentBot(this);


        this.agentBot.bot.once('spawn', async () => {
            console.log(`${this.name} spawned.`);
            this.coder.clear();
            
            const ignore_messages = [
                "Set own game mode to",
                "Set the time to",
                "Set the difficulty to",
                "Teleported ",
                "Set the weather to",
                "Gamerule "
            ];
            this.agentBot.bot.on('chat', (username, message) => {
                if (username === this.name) return;
                
                if (ignore_messages.some((m) => message.startsWith(m))) return;

                console.log('received message from', username, ':', message);
    
                this.handleMessage(username, message);
            });

            // set the bot to automatically eat food when hungry
            this.agentBot.bot.autoEat.options = {
                checkOnItemPickup: false,
                eatingTimeout: 0,
                equipOldItem: false,
                ignoreInventoryCheck: false,
                offhand: false,
                priority: 'foodPoints',
                startAt: 14,
                bannedFood: ["rotten_flesh", "spider_eye", "poisonous_potato", "pufferfish", "chicken"]
            };

            if (init_message) {
                void this.handleMessage('system', init_message);
            } else {
                this.agentBot.bot.chat('Hello world! I am ' + this.name);

                //WTF pretty sure this doesn't do anything
                //this.bot.emit('finished_executing');
            }

            this.startEvents();
        });
    }

    cleanChat(message: string) {
        // newlines are interpreted as separate chats, which triggers spam filters. replace them with spaces
        message = message.replace('\n', '  ');
        return this.agentBot.bot.chat(message);
    }

    async handleMessage(source: string, message: string) {
        if (!!source && !!message)
            await this.history.add(source, message);

        const user_command_name = containsCommand(message);
        if (user_command_name) {
            if (!commandExists(user_command_name)) {
                this.agentBot.bot.chat(`Command '${user_command_name}' does not exist.`);
                return;
            }
            this.agentBot.bot.chat(`*${source} used ${user_command_name.substring(1)}*`);
            let execute_res = await executeCommand(this, message);
            if (user_command_name === '!newAction') {
                // all user initiated commands are ignored by the agent except for this one
                // add the preceding message to the history to give context for newAction
                let truncated_msg = message.substring(0, message.indexOf(user_command_name)).trim();
                await this.history.add(source, truncated_msg);
            }
            if (execute_res) 
                this.cleanChat(execute_res);
            return;
        }

        for (let i=0; i<5; i++) {
            let history = this.history.getHistory();
            let res = await this.prompter.promptConvo(history);

            let command_name = containsCommand(res);

            if (command_name) { // contains query or command
                console.log(`Full response: ""${res}""`)
                res = truncCommandMessage(res); // everything after the command is ignored
                await this.history.add(this.name, res);
                if (!commandExists(command_name)) {
                    await this.history.add('system', `Command ${command_name} does not exist. Use !newAction to perform custom actions.`);
                    console.log('Agent hallucinated command:', command_name)
                    continue;
                }
                let pre_message = res.substring(0, res.indexOf(command_name)).trim();
                let chat_message = `*used ${command_name.substring(1)}*`;
                if (pre_message.length > 0)
                    chat_message = `${pre_message}  ${chat_message}`;
                this.cleanChat(chat_message);

                let execute_res = await executeCommand(this, res);

                console.log('Agent executed:', command_name, 'and got:', execute_res);

                if (execute_res)
                    await this.history.add('system', execute_res);
                else
                    break;
            }
            else { // conversation response
                await this.history.add(this.name, res);
                this.cleanChat(res);
                console.log('Purely conversational response:', res);
                break;
            }
        }

        this.history.save();
        //WTF pretty sure this doesn't do anything
        //this.bot.emit('finished_executing');
    }

    startEvents() {
        // Logging callbacks
        this.agentBot.bot.on('error' , (err) => {
            console.error('Error event!', err);
        });
        this.agentBot.bot.on('end', (reason) => {
            console.warn('Bot disconnected! Killing agent process.', reason)
            process.exit(1);
        });
        this.agentBot.bot.on('death', () => {
            this.coder.cancelResume();
            void this.coder.stop();
        });
        this.agentBot.bot.on('kicked', (reason) => {
            console.warn('Bot kicked!', reason);
            process.exit(1);
        });
        this.agentBot.bot.on('messagestr', async (message, _, jsonMsg) => {
            if (jsonMsg.translate && jsonMsg.translate.startsWith('death') && message.startsWith(this.name)) {
                console.log('Agent died: ', message);
                void this.handleMessage('system', `You died with the final message: '${message}'. Previous actions were stopped and you have respawned. Notify the user and perform any necessary actions.`);
            }
        });

    }

    isIdle() {
        return !this.coder.executing && !this.coder.generating;
    }
}
