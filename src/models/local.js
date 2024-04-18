import OpenAIApi from 'openai';

export class Local {
    constructor(model_name) {
        this.model_name = model_name;

        this.openai = new OpenAIApi(
            {
                apiKey: process.env.OPENAI_API_KEY,
                baseURL: process.env.OPENAI_API_BASE,
            }
            );
        }
    
        async sendRequest(turns, systemMessage, stop_seq='***') {
    
            let messages = [{'role': 'system', 'content': systemMessage}].concat(turns);
    
            let res = null;
            try {
                console.log('Awaiting openai api response...')
                console.log('Messages:', messages);
                let completion = await this.openai.chat.completions.create({
                    model: this.model_name,
                    messages: messages,
                    stop: stop_seq,
                });
                if (completion.choices[0].finish_reason == 'length')
                    throw new Error('Context length exceeded'); 
                console.log('Received.')
                res = completion.choices[0].message.content;
            }
            catch (err) {
                if ((err.message == 'Context length exceeded' || err.code == 'context_length_exceeded') && turns.length > 1) {
                    console.log('Context length exceeded, trying again with shorter context.');
                    return await sendRequest(turns.slice(1), systemMessage, stop_seq);
                } else {
                    console.log(err);
                    res = 'My brain disconnected, try again.';
                }
            }
            return res;
        }
    
        async embed(text) {
            const embedding = await this.openai.embeddings.create({
                model: "text-embedding-ada-002",
                input: text,
                encoding_format: "float",
            });
            return embedding.data[0].embedding;
        }
    }
    
    