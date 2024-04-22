import { AgentProcess } from './src/process/agent-process.js';
import 'reflect-metadata';
import { Command } from './src/process/ipc/command.js';
import { Message } from './src/process/ipc/message.js';
import { plainToInstance } from 'class-transformer';

let profile = './andy.json';
let load_memory = false;
let init_message = 'Say hello world and your name.';
/*
let profile2 = './jeffery.json';
let load_memory2 = false;
let init_message2 = 'Say hello world and your name.';

let jeffery = new AgentProcess()
jeffery.start(profile2, load_memory2, init_message2)*/

let andy = new AgentProcess(profile, load_memory, init_message);

andy.start();



andy.agentProcess.on('message', message => {
    console.log("i got something");
    message = plainToInstance(message);

    if (message instanceof Command) {
        console.log('bot: ', message.senderName, ' sent command: ', message.constructor.name);
    }

    if (message instanceof Message) {
        console.log('bot ', message.senderName, ' sent message ', message.message);
    }
})



