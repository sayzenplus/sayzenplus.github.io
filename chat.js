let peer = null, conn = null, myKey = null;
const messagesContainer = document.getElementById('messages');
const debugPanel = document.getElementById('debugPanel');
const statusEl = document.getElementById('status');

function logDebug(msg) {
    const p = document.createElement('p');
    p.textContent = msg;
    debugPanel.appendChild(p);
    debugPanel.scrollTop = debugPanel.scrollHeight;
}

// --- تبدیل‌ها ---
function bufToB64(buf){return btoa(String.fromCharCode(...new Uint8Array(buf)));}
function b64ToBuf(b64){return Uint8Array.from(atob(b64), c => c.charCodeAt(0));}
function strToBuf(str){return new TextEncoder().encode(str);}
function bufToStr(buf){return new TextDecoder().decode(buf);}

// --- رمزنگاری ---
async function deriveKey(pass){
    const salt = strToBuf('p2p-chat-salt');
    const baseKey = await crypto.subtle.importKey('raw', strToBuf(pass), {name:'PBKDF2'}, false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2', salt:salt, iterations:200000, hash:'SHA-256'}, baseKey, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
async function encryptMessage(key,text){
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, strToBuf(text));
    return {iv: bufToB64(iv), data: bufToB64(ct)};
}
async function decryptMessage(key, iv_b64, data_b64){
    const iv = b64ToBuf(iv_b64);
    const ct = b64ToBuf(data_b64);
    return bufToStr(await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct));
}

// --- نمایش پیام ---
function appendMsg(text, kind='them'){
    const div = document.createElement('div');
    div.className = `message ${kind}`;
    div.textContent = text;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// --- ذخیره اطلاعات ---
function saveData(){
    localStorage.setItem('name', document.getElementById('name').value);
    if(conn && conn.peer) localStorage.setItem('friendId', conn.peer);
}
function loadData(){
    const name = localStorage.getItem('name') || '';
    document.getElementById('name').value = name;
    const friendId = localStorage.getItem('friendId') || '';
    document.getElementById('friendId').value = friendId;
}

// --- ساخت Peer ---
async function start(){
    loadData();
    const name = document.getElementById('name').value || 'مهمان';
    const pass = document.getElementById('pass').value || '12345678';
    myKey = await deriveKey(pass);

    peer = new Peer();
    statusEl.textContent = 'در حال اتصال...';
    logDebug('ایجاد Peer...');

    peer.on('open', id => {
        document.getElementById('myId').textContent = id;
        statusEl.textContent = 'قطع';
        logDebug(`Peer باز شد: ${id}`);

        const friendId = document.getElementById('friendId').value;
        if(friendId) connectToPeer(friendId);
    });

    peer.on('connection', c => {
        conn = c;
        setupConnection();
    });

    peer.on('error', err => logDebug('خطا در Peer: ' + err));
}

// --- اتصال به دوست ---
function connectToPeer(remoteId){
    conn = peer.connect(remoteId);
    setupConnection();
}

// --- تنظیمات اتصال ---
function setupConnection(){
    statusEl.textContent = 'در حال اتصال...';
    conn.on('open', () => {
        appendMsg('دوست متصل شد!', 'them');
        statusEl.textContent = 'متصل';
        document.querySelector('.chat-box').style.display = 'flex';
        saveData();
        logDebug('اتصال برقرار شد');
    });

    conn.on('data', async data => {
        try{
            const plain = await decryptMessage(myKey, data.iv, data.data);
            appendMsg(plain, 'them');
            logDebug('دریافت پیام: ' + plain);
        } catch(e){
            appendMsg('[خطا در رمزگشایی]', 'them');
            logDebug('خطا در رمزگشایی پیام: ' + e);
        }
    });

    conn.on('close', () => {
        statusEl.textContent = 'قطع';
        logDebug('اتصال قطع شد');
    });

    conn.on('error', err => logDebug('خطا در اتصال: ' + err));
}

// --- ارسال پیام ---
async function sendMsg(){
    const txt = document.getElementById('textMsg').value.trim();
    if(!txt || !conn || conn.open===false) return;
    const payload = await encryptMessage(myKey, txt);
    conn.send(payload);
    appendMsg(txt,'me');
    document.getElementById('textMsg').value='';
    logDebug('ارسال پیام: ' + txt);
}

// --- لینک کوتاه اتصال ---
document.getElementById('copyLinkBtn').addEventListener('click', ()=>{
    const id = document.getElementById('myId').textContent;
    const pass = document.getElementById('pass').value;
    const link = `${location.href}?peer=${id}&pass=${pass}`;
    navigator.clipboard.writeText(link);
    logDebug('لینک اتصال کپی شد: ' + link);
});

// --- دکمه شروع ---
document.getElementById('startBtn').addEventListener('click', start);

// --- بررسی لینک URL ---
window.addEventListener('load', ()=>{
    const params = new URLSearchParams(window.location.search);
    const peerId = params.get('peer');
    const pass = params.get('pass');
    if(peerId && pass){
        document.getElementById('friendId').value = peerId;
        document.getElementById('pass').value = pass;
        logDebug('لینک اتصال تشخیص داده شد');
        start();
    }
});
