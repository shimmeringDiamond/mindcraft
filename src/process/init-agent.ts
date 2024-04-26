import { Agent } from '../agent/agent.js';
import yargs from 'yargs';

const args: string[] = process.argv.slice(1);
if (args.length < 1) {
    console.log('Usage: node init_agent.js <agent_name> [profile] [load_memory] [init_message]');
    process.exit(1);
}
interface  ArgvOptions {
    profile?: string;
    load_memory?: boolean;
    init_message?: string;
}
const argv: ArgvOptions = yargs
    .option('profile', {
        alias: 'p',
        type: 'string',
        description: 'profile filepath to use for agent'
    })
    .option('load_memory', {
        alias: 'l',
        type: 'boolean',
        description: 'load agent memory from file on startup'
    })
    .option('init_message', {
        alias: 'm',
        type: 'string',
        description: 'automatically prompt the agent on startup'
    }).argv as unknown as ArgvOptions;

void new Agent().start(argv.profile ?? "", argv.load_memory, argv.init_message);
