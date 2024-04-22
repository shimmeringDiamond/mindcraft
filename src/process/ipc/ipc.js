export class ipcObject {
    constructor(senderName, hash="") {
        if (hash != "") {
            const timenow = Date.now();
            const randomString = Math.random().toString(16).substring(2,10);
            this.hash = timenow + randomString;            
        }
        else
            this.hash = hash;
        this.senderName = senderName;        
    }
}