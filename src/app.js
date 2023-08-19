import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import Joi from 'joi';
import dayjs from 'dayjs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const nameSchema = Joi.object({
    Username: Joi.string()
        .alphanum()
        .min(2)
        .max(50)
        .required()
})

const messageSchema = Joi.object({
    To: Joi.string()
        .alphanum()
        .min(1)
        .required(),
    
    Text: Joi.string()
        .min(1)
        .required(),
    
    Type: Joi.string()
        .valid("message", "private_message")
        .required()
})

const limitSchema = Joi.object({
    Limit: Joi.number()
        .min(1)
})

const mongoClient = new MongoClient(process.env.DATABASE_URL);
let db;
let participantsList;

mongoClient.connect()
    .then(() => {
        console.log("Database Connected...")
        db = mongoClient.db()
    })
    .catch((error) => console.log(error.message));



app.get("/participants", async (req, res) => {
    try{
        const participants = await db.collection("participants").find().toArray()
        if(participants){
            participantsList = participants;    
            res.send(participants);
        }
    }catch(error){
        return res.status(500).send(error.message);
    }
})



app.post("/participants", async (req, res) => {
    const {name} = req.body;
    const time = dayjs().format('HH:mm:ss');

    try{
        const participants = await db.collection("participants").find().toArray()
        if(participants){
            participantsList = participants;
        }
    }catch(error){
        return res.status(500).send(error.message);
    }

    if(participantsList.find((User) => User.name === name)){
        return res.sendStatus(409);
    }

    if(nameSchema.validate({Username: name}).error !== undefined){
        return res.sendStatus(422);
    }else{

        try{
            await db.collection("participants").insertOne({
                name: name,
                lastStatus: Date.now()
            })
            await db.collection("messages").insertOne({
                from: name, 
                to: 'Todos', 
                text: 'entra na sala...', 
                type: 'status', 
                time: time
            })
            return res.sendStatus(201)
            
        }catch(error){
            return res.sendStatus(422);
        }
    }

})



app.get("/messages", async(req, res) => {
    const {user} = req.headers;
    const {limit} = req.query;
    
    if((limitSchema.validate({Limit: limit}).error)){
        return res.sendStatus(422);
    }
    
    try{
        const messages = await db.collection("messages").find( { $or: [ {to: "Todos"}, { from: user }, {$and: [{ to: user },  {type: "private_message"}]} ] } ).toArray();
        if(limit){
            return res.status(200).send(messages.slice(-limit));
        }else{
            return res.status(200).send(messages);
        }
    }catch(error){
        return res.sendStatus(422)
    }
})


app.post("/messages", async (req, res) => {
    const { to, text, type } = req.body;
    const User = req.headers.user;
    const time = dayjs().format("HH:mm:ss");

    try{
        const participants = await db.collection("participants").find().toArray()
        if(participants){
            participantsList = participants;
        }
    }catch(error){
        return res.status(500).send(error.message);
    }
    
    if(messageSchema.validate({To: to, Text: text, Type: type}).error !== undefined){
        console.log(messageSchema.validate({To: to, Text: text, Type: type}).error)
        return res.sendStatus(422);
    }
        if(!participantsList.find((participant) => participant.name === User)){
            return res.sendStatus(422);
        }

        try{
            await db.collection("messages").insertOne({
                from: User, 
                to: to, 
                text: text, 
                type: type, 
                time: time
            })
            return res.sendStatus(201)
        }catch(error){
            console.log(error)
            return res.sendStatus(422)
        }
})


app.post("/status", async (req, res) => {
    const User = req.headers.user;

    if(!User) return res.sendStatus(404);

    try{
        const participants = await db.collection("participants").find().toArray()
        if(participants){
            participantsList = participants;
        }
    }catch(error){
        return res.status(500).send(error.message);
    }
    
    if(!participantsList.find((participant) => participant.name === User)) return res.sendStatus(404);   

    try{
        const time = Date.now()
        await db.collection("participants").updateOne({name: User},{$set:{lastStatus: time}})
        return res.sendStatus(201);
    }catch(error){
        return res.sendStatus(404);
    }
})



app.delete("/messages/:ID", async (req, res) => {
    const User = req.headers.user;
    const id = req.params.ID;

    if(!User) return res.sendStatus(404);

    if(!id) return res.sendStatus(404)

    try{
        const participants = await db.collection("participants").find().toArray()
        if(participants){
            participantsList = participants;
        }
    }catch(error){
        return res.status(500).send(error.message);
    }

    if(!participantsList.find((participant) => participant.name === User)){
        return res.sendStatus(404);
    }

    try{
        const messagesList = await db.collection("messages").findOne( {_id: new ObjectId(id)} );
        if(messagesList.from !== User) return res.sendStatus(401);

        if(!messagesList) {console.log("entrou aqui"); return res.sendStatus(404); };

        await db.collection("messages").deleteOne( {_id: new ObjectId(id)} )
        
        return res.sendStatus(200);
    }catch(error){
        
        return res.sendStatus(404);
    }
    
})




app.put("/messages/:ID", async (req, res) => {
    const { to, text, type } = req.body;
    const User = req.headers.user;
    const id = req.params.ID;

    if(!User) return res.sendStatus(404);

    if(!id) return res.sendStatus(404)

    try{
        const participants = await db.collection("participants").find().toArray()
        if(participants){
            participantsList = participants;
        }
    }catch(error){
        return res.status(500).send(error.message);
    }
    
    if(messageSchema.validate({To: to, Text: text, Type: type}).error !== undefined){
        return res.sendStatus(422);
    }

    if(!participantsList.find((participant) => participant.name === User)){
        return res.sendStatus(401);
    }

    try{
        const messagesList = await db.collection("messages").findOne( {_id: new ObjectId(id)} );
        if(!messagesList) return res.sendStatus(404)

        if(messagesList.from !== User) return res.sendStatus(401);

        await db.collection("messages").updateOne({_id: new ObjectId(id)},{$set:{ to, text, type }})
        return res.sendStatus(200);
    }catch(error){
        return res.status(500).send(error);
    }
})


setInterval(async (UsersAFK) => {
    const now = Date.now() - 10000;
        try{
            UsersAFK = await db.collection("participants").find( { lastStatus: { $lt: now} } ).toArray()
            console.log(UsersAFK)
            for (const participante of UsersAFK) {
                console.log(participante.name)
                await db.collection("participants").deleteOne({ name: participante.name  });
                const mensagemStatus = { 
                    from: participante.name, 
                    to: 'Todos', 
                    text: 'sai da sala...', 
                    type: 'status', 
                    time: dayjs().format("HH:mm:ss") 
                };
                await db.collection("messages").insertOne(mensagemStatus);
                // Carrega a lista de participantes
                try{
                    const participants = await db.collection("participants").find().toArray()
                    if(participants){
                        participantsList = participants;
                    }
                }catch(error){
                    return res.status(500).send(error.message);
                }
                console.log(`Participante ${participante.name} removido e mensagem de status adicionada ao banco.`);
            }
            
        }catch(error){
            console.log(error)
        }
}, 15000)


const PORT = 5000;
app.listen(PORT, () => console.log(`Server is running at port ${PORT}`));