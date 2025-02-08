const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");

const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const OpenAI = require("openai");
const { VertexAI } = require("@google-cloud/vertexai");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Readable } = require("stream");

initializeApp();

const fillers = {
  Bible: [
    "I'm so glad you asked that!",
    "That's a wonderful question about faith!",
    "It's great to be curious about God's stories!",
    "What a thoughtful question!",
    "I'm excited to share this with you!",
    "That's a beautiful question to explore!",
    "I love your curiosity about the Bible!",
    "What an interesting thing to think about!",
    "I'm happy to help you learn more!",
    "That's a fantastic question about our faith!",
  ],
  Science: [
    "I'm thrilled you want to know more!",
    "What a great question about science!",
    "It's awesome to be curious about the world!",
    "I'm excited to explore this with you!",
    "That's a fascinating topic to dive into!",
    "Your curiosity is wonderful—let's find out!",
    "That's a smart question to ask!",
    "I love how eager you are to learn!",
    "What an interesting thing to discover together!",
    "I'm here to help you understand better!",
  ],
  Language: [
    "Oh, that's a fun question about words!",
    "I'm so glad you're curious about language!",
    "What a delightful question to explore together!",
    "It's wonderful that you want to learn more!",
    "I love your enthusiasm for language!",
    "That's a great thing to think about with words!",
    "Your curiosity is inspiring—let's rhyme it out!",
    "What an exciting topic to discuss!",
    "I'm here to help you play with language!",
    "That's a clever question—let's explore it!",
  ],
  History: [
    "What an intriguing question about history!",
    "I'm so glad you're interested in our past!",
    "It's wonderful to be curious about history!",
    "What a great topic for us to explore together!",
    "Your interest in history is fantastic—let's dive in!",
    "That's a thoughtful question about our world’s story!",
    "I love how eager you are to learn about the past!",
    "What an exciting thing to uncover together!",
    "I'm here to help you learn more about history!",
    "That’s a brilliant question—let’s discover the answer!",
  ],
};

function getRandomFiller(persona) {
  const personaFillers = fillers[persona];
  if (!personaFillers) {
    throw new Error("Invalid persona specified.");
  }

  const randomIndex = Math.floor(Math.random() * personaFillers.length);
  return personaFillers[randomIndex];
}

exports.askGemini = onRequest(async (req, res) => {
  const question = req.query.question;
  const gemini = getModel("gemini");
  const result = await gemini.generateContent(question);
  const answer = result.response.text();
  console.log(answer);
  res.json({ answer });
});

exports.numbersStream = onRequest((request, response) => {
  // Set headers for streaming
  response.setHeader("Content-Type", "text/plain");
  response.setHeader("Transfer-Encoding", "chunked");

  // Create a readable stream
  const randomNumberStream = new Readable({
    read() {
      for (let i = 0; i < 100; i++) {
        const randomNumber = Math.floor(Math.random() * 100) + 1;
        this.push(randomNumber.toString());
        this.push("\n");
      }
      this.push(null);
    },
  });

  randomNumberStream.pipe(response);
});

exports.askOpenAIStream = onRequest(async (req, res) => {
  const gpt = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const question = req.query.question;
  const messages = [{ role: "user", content: question }];

  console.log("----- streaming request ----------------", question);

  try {
    const response = await gpt.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages,
      stream: true,
    });

    res.setHeader("Content-Type", "text/plain");
    const stream = new ReadableStream({
      async pull(controller) {
        for await (const chunk of response) {
          if (chunk.choices[0].delta.content) {
            console.log("got", chunk.choices[0].delta.content);
            controller.enqueue(chunk.choices[0].delta.content);
          }
        }
        controller.close();
      },
    });

    const reader = stream.getReader();

    const push = async () => {
      const { done, value } = await reader.read();
      if (done) {
        return res.end(); // End response when done
      }
      console.log("Sending ", value);
      res.write(value); // Write each chunk to the response
      push(); // Continue reading
    };

    push();
  } catch (error) {
    console.error("Error fetching data from OpenAI:", error);
    res.status(500).json({ error: "Error fetching data from OpenAI" });
  }
});

exports.askOpenAI = onRequest(async (req, res) => {
  const question = req.query.question;
  const openai = getModel("openai");

  const messages = [{ role: "user", content: question }];
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    temperature: 0.1,
    messages: messages,
  });
  const answer = completion.choices[0].message.content;
  console.log(answer);
  res.json({ answer });
});

const getModel = (modelName) => {
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

exports.askQuestion = onRequest(async (req, res) => {
  console.log(req.query);
  const { model, question } = req.query;
  const selectedModel = model || "gemini";
  const modelInstance = getModel(selectedModel);

  let answer;

  try {
    if (model === "gemini") {
      const result = await modelInstance.generateContent(question);
      answer = result.response.text();
    } else if (model === "openai") {
      const messages = [{ role: "user", content: question }];
      const completion = await modelInstance.chat.completions.create({
        model: "gpt-3.5-turbo",
        temperature: 0.1,
        messages: messages,
        // stream: true,
      });
      answer = completion.choices[0].message.content;
      // //-------- streaming start --------------------
      // const response = await modelInstance.chat.completions.create({
      //   model: "gpt-3.5-turbo",
      //   temperature: 0.1,
      //   messages: messages,
      //   stream: true,
      // });

      // const stream = new ReadableStream({
      //   async pull(controller) {
      //     for await (const chunk of response) {
      //       if (chunk.choices[0].delta.content) {
      //         controller.enqueue(chunk.choices[0].delta.content);
      //       }
      //     }
      //     controller.close();
      //   },
      // });

      // // Set headers for streaming
      // res.setHeader("Content-Type", "text/plain");

      // // Stream response back to client
      // stream
      //   .getReader()
      //   .read()
      //   .then(function processText({ done, value }) {
      //     if (done) {
      //       return res.end(); // End response when done
      //     }
      //     res.write(value); // Write each chunk to the response
      //     return stream.getReader().read().then(processText); // Continue reading
      //   });
      // //-------- streaming end --------------------
    } else {
      answer =
        "Please select one of the following models: 1. Gemini, 2. OpenAi";
    }
    console.log(answer);
    res.json({ answer });
  } catch (error) {
    console.error("Error generating content:", error);
    res.status(500).json({ error: "Failed to generate content" });
  }
});

const getAnswer = async (macid, question, role) => {
  const useModel = "openai";

  if (!macid || typeof macid !== "string") {
    throw new Error("Invalid macid");
  }
  if (!question || typeof question !== "string") {
    throw new Error("Invalid question");
  }

  let messages = [];
  if (useModel === "openai") {
    messages = [{ role: "system", content: role }];
  } else if (useModel === "gemini") {
    messages = [{ role: "user", parts: role }];
  }

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

  console.time("getAnswerExecutionTime"); // Start timer
  const startTime = performance.now(); // Start high-resolution timer

  let answer, segue;
  try {
    messages.push({ role: "user", content: question });
    const model = getModel(useModel);

    if (useModel === "gemini") {
      const result = await model.generateContent(question);
      answer = result.response.text();
    } else if (useModel === "openai") {
      {
        const completion = await model.chat.completions.create({
          model: "gpt-3.5-turbo",
          temperature: 0.1,
          messages: messages,
        });
        answer = completion.choices[0].message.content;
        console.log("--------------------------------");
        console.log(messages);
        console.log("--------------------------------");
      }
      // {
      //   const completion = await model.chat.completions.create({
      //     model: "gpt-3.5-turbo",
      //     temperature: 0.1,
      //     messages: [
      //       {
      //         role: "user",
      //         // content: `Provide a concise segue summary sentence of 4-10 words for the following answer that would be prepended to the next question \n ${answer}`,
      //         content: `Based on the previous answer, summarize it in 4-10 words that connects to the current question:\nPrevious Answer: ${answer}`,
      //       },
      //     ],
      //   });
      //   segue = completion.choices[0].message.content;
      // }
    }

    console.log("-------------------- prompt --------------------------------");
    console.log(messages);
    console.log("-------------------- answer --------------------------------");
    console.log(answer);
    console.log("-------------------- segue --------------------------------");
    console.log(JSON.stringify(segue));
  } catch (error) {
    logger.error("Getting answer from model :", error);
    throw new Error("Failed to get the answer from " + useModel);
  }
  const endTime = performance.now(); // End high-resolution timer
  const elapsedTime = endTime - startTime; // Calculate elapsed time
  console.log("------ time taken -------");
  console.log(elapsedTime);

  await getFirestore()
    .collection("messages")
    .doc(macid)
    .collection("chats")
    .add({ question, answer });

  return { answer };
};

exports.askBuddy = onRequest(async (req, res) => {
  const macid = req.query.macid;
  const persona = req.query.persona;
  const question = req.query.question;
  const filler = getRandomFiller(persona);

  logger.info("askBuddy called", req.query);

  switch (persona) {
    case "Bible":
      role = `You are a friendly and gentle teacher named Mary who loves to 
        share stories and lessons from the Bible with children aged 3 to 8 years old.
        When answering their questions, use simple words and concepts they can
        understand and keep it short 4-6 lines. Make your explanations fun and 
        engaging, often using stories, parables, and examples from the Bible. 
        Always be kind, patient, and encouraging, helping the children to learn 
        about Jesus, His love, and the Christian faith. After providing your 
        answer, ask a leading question to inspire the child to ask more about 
        the teachings of the Bible.`;
      break;
    case "Science":
      role = `You are a friendly and enthusiastic science teacher named
        Mary who loves to explain scientific concepts to children aged 3 to 8 
        years old. When answering their questions, use simple words and concepts 
        they can understand. Make your explanations fun and engaging, often using
        interesting facts, stories, and examples. Always be kind, patient, and 
        encouraging, helping the children to develop a love for science and 
        curiosity about the world around them. After providing your answer, ask
        only ONE leading question to inspire the child to ask more about science.`;
      break;
    case "Language":
      role = `You are a friendly and enthusiastic language teacher named 
        Mary who loves to explain language concepts to children aged 3 to 8 years 
        old. When answering their questions, use simple words and make your 
        answers rhyme. Make your explanations fun and engaging, often using 
        interesting facts, stories, and examples. Always be kind, patient, and 
        encouraging, helping the children to develop a love for language and 
        curiosity about words. After providing your answer, ask only ONE leading 
        question to inspire the child to ask more about language.`;
      break;
    case "History":
      role = `You are a knowledgeable history teacher who loves sharing fascinating 
        stories about our past with children aged 3 to 8 years old. Use simple words 
        and concepts they can understand while making your explanations fun and engaging.
        Encourage them with interesting facts about historical events or figures. After 
        providing your answer, ask a leading question that inspires them to learn more about history.`;
      break;
    default:
      return res.status(400).json({ error: "Invalid persona specified." });
  }

  const { answer } = await getAnswer(macid, question, role);
  res.json({ answer, filler });
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
  // const answer = await getAnswer(macid, question, role);
  const answer = "God made it all, he takes care of all the children";
  res.json(answer);
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
  const answer = await getAnswer(macid, question, role);
  res.json(answer);
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
  const answer = await getAnswer(macid, question, role);
  res.json(answer);
});
