let peer = null, conn = null, myKey = null;
const messagesContainer = document.getElementById('messages');
const startBtn = document.getElementById('startBtn');
const sendBtn = document.getElementById('sendBtn');
const textMsg = document.getElementById('textMsg');
const chatBox = document.querySelector('.chat-box');

// --- تبدیل‌ها ---
function bufToB64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64) {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function strToBuf(str) {
    return new TextEncoder().encode(str);
}

function bufToStr(buf) {
    return new TextDecoder().decode(buf);
}

// --- رمزنگاری ---
async function deriveKey(pass) {
    const salt = strToBuf('p2p-chat-salt');
    const baseKey = await crypto.subtle.importKey('raw', strToBuf(pass), { name: 'PBKDF2' }, false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 200000, hash: 'SHA-256' }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function encryptMessage(key, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, strToBuf(text));
    return { iv: bufToB64(iv), data: bufToB64(ct) };
}

async function decryptMessage(key, iv_b64, data_b64) {
    const iv = b64ToBuf(iv_b64);
    const ct = b64ToBuf(data_b64);
    return bufToStr(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
}

// --- نمایش پیام ---
function appendMsg(text, kind = 'them') {
    const div = document.createElement('div');
    div.className = `message ${kind}`;
    div.textContent = text;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- ساخت Peer ---
async function start() {
    const name = document.getElementById('name').value || 'مهمان';
    const pass = document.getElementById('pass').value || '12345678';
    myKey = await deriveKey(pass);

    peer = new Peer();
    peer.on('open', id => {
        document.getElementById('myId').textContent = id;
        saveData();
    });

    peer.on('connection', c => {
        conn = c;
        conn.on('data', async data => {
            try {
                const plain = await decryptMessage(myKey, data.iv, data.data);
                appendMsg(plain, 'them');
            } catch {
                appendMsg('[خطا در رمزگشایی]', 'them');
            }
        });

        conn.on('open', () => {
            appendMsg('اتصال برقرار شد!', 'them');
            chatBox.style.display = 'block';
        });
    });

    const friendId = localStorage.getItem('friendId');
    if (friendId) {
        connectToPeer(friendId);
    }
}

// --- وصل شدن به Peer دوست ---
async function connectToPeer(remoteId) {
    conn = peer.connect(remoteId);
    conn.on('open', () => {
        appendMsg('اتصال برقرار شد!', 'them');
        chatBox.style.display = 'block';
    });

    conn.on('data', async data => {
        try {
            const plain = await decryptMessage(myKey, data.iv, data.data);
            appendMsg(plain, 'them');
        } catch {
            appendMsg('[خطا در رمزگشایی]', 'them');
        }
    });
}

// --- ارسال پیام ---
async function sendMsg() {
    const txt = textMsg.value.trim();
    if (!txt || !conn || conn.open === false) return;
    const payload = await encryptMessage(myKey, txt);
    conn.send(payload);
    appendMsg(txt, 'me');
    textMsg.value = '';
}

// --- ذخیره داده‌ها ---
function saveData() {
    localStorage.setItem('name', document.getElementById('name').value);
    localStorage.setItem('friendId', conn.peer);
}

// --- رویداد دکمه‌ها ---
startBtn.addEventListener('click', start);
sendBtn.addEventListener('click', sendMsg);
