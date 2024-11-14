import express, { json } from 'express';
import fs from 'fs';
import path, { parse } from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url'; // Import for __filename
import { dirname } from 'path'; // Import for __dirname
import { GoogleGenerativeAI } from "@google/generative-ai";
import multer from 'multer';
import pdf2html from 'pdf2html';
import dotenv from 'dotenv';

// Set up multer for file uploads
const upload = multer({ dest: 'uploads/' }); // Directory to temporarily store uploaded PDFs
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config();
// Set up Gemini
const genAI = new GoogleGenerativeAI(process.env.API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.0-pro" });

const app = express();
const port = 80;

// CORS 설정
app.use(cors());
app.options('*', cors());

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static('public'));

// 유저 문서 저장 경로
const userDocsDir = path.join(__dirname, 'userdocs');
if (!fs.existsSync(userDocsDir)) {
    fs.mkdirSync(userDocsDir);
}

// 퀴즈 저장 경로
const quizDir = path.join(__dirname, 'quizdocs');
if (!fs.existsSync(quizDir)) {
    fs.mkdirSync(quizDir);
}

// 화이트보드 사진 저장 경로
const USERBOARD_DIR = path.join(__dirname, 'userboards');
if (!fs.existsSync(USERBOARD_DIR)) {
    fs.mkdirSync(USERBOARD_DIR)
}

// 문서 저장 API
app.post('/docs', (req, res) => {
    const { uid, content, title } = req.body;

    if (!uid || !content || !title) {
        return res.status(400).json({ message: 'uid, content, and title are required' });
    }

    const filePath = path.join(userDocsDir, `${uid}.html`);
    const fileContent = `<html><head><title>${title}</title></head><body>${content}</body></html>`;

    fs.writeFile(filePath, fileContent, (err) => {
        if (err) {
            console.error('Error saving document:', err);
            return res.status(500).json({ message: 'Error saving document' });
        }
        res.json({ message: 'Document created successfully' });
    });
});
// API endpoint to upload PDF
app.post('/uploadpdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
        // Convert the uploaded PDF to HTML
        const html = await pdf2html.html(req.file.path);
        
        // Prepare the document data to save
        const uid = generateUID(); // Use your UID generation function
        const title = req.file.originalname.replace('.pdf', '');
        const newDoc = { uid, content: html, title };

        // Save the HTML document using the existing /docs endpoint
        const response = await fetch('http://127.30.1.43/docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newDoc),
        });

        if (!response.ok) {
            throw new Error('Failed to save document');
        }

        // Delete the uploaded PDF file after processing
        fs.unlink(req.file.path, (err) => {
            if (err) {
                console.warn(`Error deleting file: ${req.file.path}`, err);
            }
        });

        res.json({ message: 'PDF uploaded, converted, and saved successfully', uid });

    } catch (error) {
        console.error('Error processing PDF:', error);

        // Attempt to delete the file if an error occurs
        fs.unlink(req.file.path, (err) => {
            if (err) {
                console.warn(`Error deleting file: ${req.file.path}`, err);
            }
        });

        res.status(500).json({ message: 'Error processing PDF: ' + error.message });
    }
});

// 문서 업데이트 API
app.put('/docs/:uid', (req, res) => {
    const { content, title } = req.body;
    const uid = req.params.uid;

    if (!uid || !content || !title) {
        return res.status(400).json({ message: 'uid, content, and title are required' });
    }

    const filePath = path.join(userDocsDir, `${uid}.html`);
    const fileContent = `<html><head><title>${title}</title></head><body>${content}</body></html>`;

    fs.writeFile(filePath, fileContent, (err) => {
        if (err) {
            console.error('Error updating document:', err);
            return res.status(500).json({ message: 'Error updating document' });
        }
        res.json({ message: 'Document updated successfully' });
    });
});

// 문서 로드 API
app.get('/docs/:uid', (req, res) => {
    const uid = req.params.uid;
    const filePath = path.join(userDocsDir, `${uid}.html`);

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading document:', err);
            return res.status(404).json({ message: 'Document not found' });
        }
        res.json({ content: data });
    });
});

// 문서 삭제 API
app.delete('/deletedocuments', (req, res) => {
    const { uid } = req.query;

    if (!uid) {
        return res.status(400).json({ message: 'UID parameter is missing' });
    }

    const filePath = path.join(userDocsDir, `${uid}.html`);

    fs.unlink(filePath, (err) => {
        if (err) {
            console.error('Error deleting document:', err);
            return res.status(404).json({ message: 'Document not found' });
        }
        res.json({ message: `Document ${uid} deleted successfully` });
    });
});

// 퀴즈 저장 API
app.post('/save-quiz', (req, res) => {
    const { uid, title, content } = req.body; // title 추가

    if (!uid || !content) {
        return res.status(400).json({ message: 'uid and content are required' });
    }

    const quizData = { title, content }; // quizData 정의
    const quizPath = path.join(quizDir, `${uid}.json`);

    fs.writeFile(quizPath, JSON.stringify(quizData, null, 2), (err) => {
        if (err) {
            console.error('Error saving quiz:', err);
            return res.status(500).json({ message: 'Error saving quiz' });
        }
        res.json({ message: 'Quiz saved successfully' });
    });
});


// 퀴즈 로드 API
app.get('/quiz/:uid', (req, res) => {
    const uid = req.params.uid;
    const quizPath = path.join(quizDir, `${uid}.json`);

    fs.readFile(quizPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading quiz:', err);
            return res.status(404).json({ message: 'Quiz not found' });
        }
        try {
            const quizData = JSON.parse(data);
            res.json(quizData);
        } catch (parseError) {
            console.error('Error parsing quiz data:', parseError);
            res.status(500).json({ message: 'Error parsing quiz data' });
        }
    });
});

// AI 문서 생성 API
app.post('/generate-ai-doc', async (req, res) => {
    const { prompt } = req.body;

    if (!prompt) {
        return res.status(400).json({ message: 'Prompt is required' });
    }

    const systemInstructions = "You are a docs generator. Be helpful and always respond in HTML format but make some many styles, especially in body, please make some elements in body and use <br> for enter. Make the docs easy to see. Also, make your length lower than 1000 tokens.";

    // Combine the user prompt with system instructions
    const combinedPrompt = `${systemInstructions}\n\nUser Prompt: ${prompt}`;

    try {
        const result = await model.generateContent(combinedPrompt);
        return res.json({ content: result.response.text(    ) });
    } catch (error) {
        console.error('Error generating AI document:', error);
        return res.status(500).json({ message: 'Error generating AI document: ' + error.message });
    }
});

app.post('/generate-ai-quiz', async (req, res) => {
    console.log("")
    const userPrompt = req.body.userPrompt;
    const chat = model.startChat({
        history: [
            {
                role: "user",
                parts: [{ text: "I want to create a quiz. There are two types: multiple and subjective question." }]
            },
            {
                role: "model",
                parts: [{ text: "Great! What quiz do you want to form?" }]
            },
            {
                role: "user",
                parts: [{ text: userPrompt }]
            },
            {
                role: "model",
                parts: [{ text: "Okay, I will generate the elements of your quiz for your request." }]
            },
        ],
    });

    // Generate title
    let result = await chat.sendMessage("What would be the title of this quiz?");
    const quizResultTitle = result.response.text().trim();

    // Generate subtitle
    result = await chat.sendMessage("What would be the subtitle of this quiz?");
    const quizResultSubtitle = result.response.text().trim();

    const questions = [];

    // Generate multiple choice question
    result = await chat.sendMessage("Please provide a multiple choice question.");
    const multipleQuestion = result.response.text().trim();

    result = await chat.sendMessage("Please provide four options for this question (comma-separated).");
    const options = result.response.text().trim();
    result = (await chat.sendMessage("What is the correct answer index (1-4)? ONLY RESPOND NUMBER")).response.text().trim();
    const correctAnswerIndex = parseInt(result, 10) - 1;

    const optionsArray = options.split(',').map(option => option.trim());

    questions.push({
        text: multipleQuestion,
        type: 'multiple',
        options: optionsArray,
        correctAnswer: correctAnswerIndex // Keep as a number
    });

    // Generate subjective question
    result = await chat.sendMessage("Please provide a subjective question.");
    const subjectiveQuestion = result.response.text().trim();

    result = await chat.sendMessage("What is the correct answer for this question?");
    const correctSubjectiveAnswer = result.response.text().trim();

    questions.push({
        text: subjectiveQuestion,
        type: 'subjective',
        correctAnswer: correctSubjectiveAnswer
    });

    const quizResponse = {
        title: quizResultTitle,
        content: {
            title: quizResultTitle,
            subtitle: quizResultSubtitle,
            questions: questions
        }
    };
    console.log(quizResponse)
    res.json(quizResponse);
});
app.get('/userboards/:uid', (req, res) => {
    const uid = req.params.uid;
    const filePath = path.join(USERBOARD_DIR, `${uid}.jpg`);
    if (!fs.existsSync(filePath)) {
        // 파일이 없으면 blank 이미지로 초기화
        fs.writeFileSync(filePath, fs.readFileSync('blank.jpg'));
    }
    res.sendFile(filePath);
}); 
// 화이트보드 이미지 저장 (POST/PUT)
app.post('/userboards', (req, res) => {
    const { uid, image } = req.body;
    const filePath = path.join(USERBOARD_DIR, `${uid}.jpg`);
    const base64Data = image.replace(/^data:image\/jpeg;base64,/, "");
    fs.writeFile(filePath, base64Data, 'base64', (err) => {
        if (err) return res.status(500).send('Failed to save image.');
        res.status(200).send(`Image saved as ${uid}.jpg`);
    });
});
//404오류   
app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, 'public', 'moreservices', 'error', '404.html'));
});
function generateUID() {
    const now = new Date();

    // 현재 시각의 요소들을 추출
    const year = now.getFullYear();
    const month = now.getMonth() + 1;  // 월은 0부터 시작하므로 +1 필요
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();

    // 각 요소를 16진수로 변환하고 자릿수 맞추기
    const hexYear = year.toString(16).padStart(4, '0'); // 연도는 4자리
    const hexMonth = month.toString(16).padStart(2, '0');
    const hexDay = day.toString(16).padStart(2, '0');
    const hexHours = hours.toString(16).padStart(2, '0');
    const hexMinutes = minutes.toString(16).padStart(2, '0');
    const hexSeconds = seconds.toString(16).padStart(2, '0');
    const hexMilliseconds = milliseconds.toString(16).padStart(3, '0');

    // UID 조합 (연, 월, 일, 시, 분, 초, 밀리초)
    const uid = `${hexYear}${hexMonth}${hexDay}${hexHours}${hexMinutes}${hexSeconds}${hexMilliseconds}`;

    return uid;
}

// 서버 시작
app.listen(port, '59.9.194.155',() => {
    console.log(`Server running at HTTP localhost`);
});