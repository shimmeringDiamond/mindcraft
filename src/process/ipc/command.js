import { ipcObject } from "./ipc.js";

export class Command extends ipcObject{
    constructor(senderName, args=[], response="") {
        super(senderName);
        this.args = args;
        this.response = response;
    }
}

export class GetNeighbors extends Command{
    constructor(senderName, location) {
        super(senderName);
        this.location = location;
    }
}

export const commandList = [
    {
        name: 'GetNeighbors',
        description: 'Gets the names of all bots that are close together in the minecraft world',

    }
]