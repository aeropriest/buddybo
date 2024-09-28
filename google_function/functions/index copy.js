const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const { VertexAI } = require("@google-cloud/vertexai");
const { GoogleGenerativeAI } = require("@google/generative-ai");

initializeApp();

const getModelInstance = (modelName) => {
  switch (modelName) {
    case "gemini":
      return new GoogleGenerativeAI(
        process.env.GEMINI_API_KEY
      ).getGenerativeModel({ model: "gemini-1.5-flash" });
    case "openai":
      return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // Add other models as needed
    default:
      throw new Error("Unsupported model name");
  }
};

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

exports.askVertex = onRequest(async (req, res) => {
  const prompt = req.query.prompt;
  const result = await model.generateContent(prompt);
  const answer = result.response.text();
  console.log(answer);
  res.json({ answer });
});

const getAnswerWithContext = async (macid, question, role) => {
  if (!macid || typeof macid !== "string") {
    throw new Error("Invalid macid");
  }
  if (!question || typeof question !== "string") {
    throw new Error("Invalid question");
  }

  const messages = [{ role: "system", content: role }];

  try {
    const messagesRef = await getFirestore()
      .collection("messages")
      .doc(macid)
      .collection("chats");

    let history = [];
    const snapshot = await messagesRef.limit(3).get();
    history = snapshot.docs.map((doc) => doc.data());
    history.forEach((message, index) => {
      messages.push({ role: "user", content: message.question });
      messages.push({ role: "assistant", content: message.answer });
    });
  } catch (error) {
    logger.error("Error fetching messages from Firestore:", error);
    throw new Error("Failed to fetch messages from Firestore");
  }

  messages.push({ role: "user", content: question });
  const gpt = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    stream: true,
    temperature: 0.7, // Adjust the temperature as needed
    maxTokens: 50, // Adjust the maxTokens as needed
    stop: ["\n"], // Stop generation at newline character
  });
  const completion = await gpt.chat.completions.create({
    model: "gpt-3.5-turbo",
    temperature: 0.1,
    messages: messages,
  });

  console.log("-------------------- prompt --------------------------------");
  console.log(messages);
  const answer = completion.choices[0].message.content;
  console.log("-------------------- answer --------------------------------");
  console.log(completion.choices);

  await getFirestore()
    .collection("messages")
    .doc(macid)
    .collection("chats")
    .add({ question, answer });

  return answer;
};

exports.askBuddy = onRequest(async (req, res) => {
  const macid = req.query.macid;
  const question = req.query.question;
  const role = `You are a teacher for 3-8 years old. Answer the children with 
  facts in 2-6 lines. If there is no answer found, encourage them to ask 
  something else with a leading question related to this conversation.`;
  const answer = await getAnswerWithContext(macid, question, role);
  res.json({ answer });
});

exports.askBible = onRequest(async (req, res) => {
  const macid = req.query.macid;
  const question = req.query.question;
  const role = `You are a friendly and gentle teacher named Mary who loves to 
  share stories and lessons from the Bible with children aged 3 to 8 years old.
   When answering their questions, use simple words and concepts they can
    understand and keep it short 4-6 lines. Make your explanations fun and 
    engaging, often using stories, parables, and examples from the Bible. 
    Always be kind, patient, and encouraging, helping the children to learn 
    about Jesus, His love, and the Christian faith. After providing your 
    answer, ask a leading question to inspire the child to ask more about 
    the teachings of the Bible. Keep the answers 4-6 lines long, be more 
    subtle mentioning Bible, Jesus, and God.`;
  const answer = await getAnswerWithContext(macid, question, role);
  res.json({ answer });
});

exports.askScience = onRequest(async (req, res) => {
  const macid = req.query.macid;
  const question = req.query.question;
  const role = `You are a friendly and enthusiastic science teacher named
   Mary who loves to explain scientific concepts to children aged 3 to 8 
   years old. When answering their questions, use simple words and concepts 
   they can understand. Make your explanations fun and engaging, often using
    interesting facts, stories, and examples. Always be kind, patient, and 
    encouraging, helping the children to develop a love for science and 
    curiosity about the world around them. After providing your answer, ask
     only ONE leading question to inspire the child to ask more about science.
      Keep the answers 4-6 lines long and do not prepend the word "answer".`;
  const answer = await getAnswerWithContext(macid, question, role);
  res.json({ answer });
});

exports.askLanguage = onRequest(async (req, res) => {
  const macid = req.query.macid;
  const question = req.query.question;
  const role = `You are a friendly and enthusiastic language teacher named 
  Mary who loves to explain language concepts to children aged 3 to 8 years 
  old. When answering their questions, use simple words and make your 
  answers rhyme.Make your explanations fun and engaging, often using 
  interesting facts, stories, and examples. Always be kind, patient, and 
  encouraging, helping the children to develop a love for language and 
  curiosity about words. After providing your answer, ask only ONE leading 
  question to inspire the child to ask more about language. Keep the
   answers 4-6 lines long and do not prepend the word "answer".`;
  const answer = await getAnswerWithContext(macid, question, role);
  res.json(answer);
});
