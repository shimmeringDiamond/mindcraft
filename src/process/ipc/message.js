import { ipcObject } from "./ipc.js";

export class Message  extends ipcObject{
    constructor(senderName, message="", recipientName=[]) {
        super(senderName);

        if (message != "") {
            this.message = message;
        }
        if (recipientName != [])  {
            this.recipients = recipientName
        }
    }
}