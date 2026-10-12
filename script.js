const socket = io();

let currentUsername = "";
let currentRoom = "asosiy-xona";
let localStream = null;
let screenStream = null;
let cameraStream = null;
let isSharingScreen = false;
let peers = {}; 
let currentRotation = 0;

let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

const iceConfig = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// Tema (Dark/Light)
function toggleTheme() {
    const body = document.body;
    const themeIcon = document.getElementById("theme-icon");
    body.classList.toggle("light-mode");
    if (body.classList.contains("light-mode")) {
        themeIcon.innerText = "☀️";
        localStorage.setItem("theme", "light");
    } else {
        themeIcon.innerText = "🌙";
        localStorage.setItem("theme", "dark");
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem("theme") === "light") {
        document.body.classList.add("light-mode");
        const themeIcon = document.getElementById("theme-icon");
        if (themeIcon) themeIcon.innerText = "☀️";
    }
});

// Sidebar va Tablarni almashtirish
function switchTab(tabName) {
    const chatTab = document.getElementById("chat-tab");
    const participantsTab = document.getElementById("participants-tab");
    const tabBtns = document.querySelectorAll(".tab-btn");

    tabBtns.forEach(btn => btn.classList.remove("active"));

    if (tabName === 'chat') {
        chatTab.style.display = "flex";
        participantsTab.style.display = "none";
        document.getElementById("btn-tab-chat")?.classList.add("active");
    } else {
        chatTab.style.display = "none";
        participantsTab.style.display = "flex";
        document.getElementById("btn-tab-participants")?.classList.add("active");
        updateParticipantsList();
    }
}

// Chap menyu ikonkalari
function switchMainTab(menuType) {
    document.querySelectorAll('.nav-icon').forEach(btn => btn.classList.remove('active'));
    
    if (menuType === 'home' || menuType === 'chat') {
        document.getElementById('nav-home')?.classList.add('active');
        switchTab('chat');
    } else if (menuType === 'participants') {
        document.getElementById('nav-users')?.classList.add('active');
        switchTab('participants');
    } else if (menuType === 'settings') {
        document.getElementById('nav-settings')?.classList.add('active');
        alert("Sozlamalar paneli tez orada ochiladi.");
    }
}

async function joinRoom() {
    const input = document.getElementById("username-input");
    const username = input.value.trim();

    if (!username) {
        alert("Iltimos, ismingizni kiriting!");
        return;
    }

    currentUsername = username;
    document.getElementById("user-display").innerText = "Foydalanuvchi: " + currentUsername;
    document.getElementById("local-username-label").innerText = currentUsername + " (Siz)";
    document.getElementById("profile-name").innerText = currentUsername;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
                echoCancellation: true,      
                noiseSuppression: false,     
                autoGainControl: false       
            }
        });
 catch (error) {
        console.error("Mikrofon yoki kameraga ruxsat berilmadi:", error);
        alert("Mikrofon yoki kameraga ruxsat berilmadi! Brauzer sozlamalarini tekshiring.");
        return;
    }

    cameraStream = localStream;
    const localVideo = document.getElementById("local-video");
    if (localStream) {
        localVideo.srcObject = localStream;
        localVideo.classList.remove("screen-share-video");
    }

    socket.emit('join-room', currentUsername, currentRoom);

    document.getElementById("login-screen").style.display = "none";
    document.getElementById("room-screen").style.display = "flex";
    document.getElementById("room-screen").classList.add("fade-in");
    
    document.getElementById("placeholder").style.display = "none";
    addSystemMessage("Siz xonaga qo'shildingiz.");
}

function checkLoginEnter(event) {
    if (event.key === "Enter") joinRoom();
}

// Mikrofonni boshqarish
function toggleMic() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    audioTrack.enabled = !audioTrack.enabled;
    const micBtn = document.getElementById("mic-btn");

    if (!audioTrack.enabled) {
        micBtn.innerText = "🔇 Mikrofon o'chiq";
        micBtn.classList.add("muted");
        addSystemMessage("Siz mikrofoningizni o'chirdingiz.");
    } else {
        micBtn.innerText = "🎤 Mikrofon";
        micBtn.classList.remove("muted");
        addSystemMessage("Siz mikrofoningizni yoqdingiz.");
    }
}

// Kamerani boshqarish
function toggleCam() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    videoTrack.enabled = !videoTrack.enabled;
    const camBtn = document.getElementById("cam-btn");

    if (!videoTrack.enabled) {
        camBtn.innerText = "📷 Kamera o'chiq";
        camBtn.classList.add("muted");
        addSystemMessage("Siz kamerangizni o'chirdingiz.");
    } else {
        camBtn.innerText = "📷 Kamera";
        camBtn.classList.remove("muted");
        addSystemMessage("Siz kamerangizni yoqdingiz.");
    }
}

// Kamerani aylantirish (Rotate)
function rotateVideo() {
    currentRotation = (currentRotation + 90) % 360;
    const localVideo = document.getElementById("local-video");
    if (localVideo) {
        localVideo.style.transform = `rotate(${currentRotation}deg)`;
    }
    addSystemMessage(`Kamera ${currentRotation} gradusga aylantirildi.`);
}

function toggleScreenShare() {
    if (!isSharingScreen) startScreenShare();
    else stopScreenShare();
}

async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        const localVideo = document.getElementById("local-video");
        localVideo.srcObject = screenStream;
        localVideo.classList.add("screen-share-video");

        for (let id in peers) {
            const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) sender.replaceTrack(screenTrack);
        }

        isSharingScreen = true;
        const shareBtn = document.getElementById("share-btn");
        shareBtn.innerText = "⏹ Ekranni to'xtatish";
        shareBtn.classList.add("active");
        addSystemMessage("Ekran ulash boshlandi.");

        screenTrack.onended = () => stopScreenShare();
    } catch (error) {
        console.error("Ekran ulashda xatolik:", error);
    }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }

    if (cameraStream) {
        const videoTrack = cameraStream.getVideoTracks()[0];
        const localVideo = document.getElementById("local-video");
        localVideo.srcObject = cameraStream;
        localVideo.classList.remove("screen-share-video");

        for (let id in peers) {
            const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender && videoTrack) sender.replaceTrack(videoTrack);
        }
    }

    isSharingScreen = false;
    const shareBtn = document.getElementById("share-btn");
    shareBtn.innerText = "🖥 Ekranni ulash";
    shareBtn.classList.remove("active");
    addSystemMessage("Ekran ulash to'xtatildi.");
}

async function toggleRecording() {
    const recBtn = document.getElementById("rec-btn");
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: { mediaSource: "screen" }, audio: true });
            recordedChunks = [];
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `dars-yozuvi-${new Date().toISOString().slice(0,10)}.webm`;
                a.click();
                URL.revokeObjectURL(url);
                addSystemMessage("Dars yozuvi saqlandi!");
            };

            mediaRecorder.start();
            isRecording = true;
            recBtn.innerText = "⏹ Yozuvni to'xtatish";
            recBtn.classList.add("active");
            addSystemMessage("Yozib olish boshlandi...");

            stream.getVideoTracks()[0].onended = () => { if (isRecording) toggleRecording(); };
        } catch (err) { console.error(err); }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recBtn.innerText = "🔴 Yozish";
        recBtn.classList.remove("active");
    }
}

function updateParticipantsList() {
    const listContainer = document.getElementById("participants-list");
    if (!listContainer) return;

    listContainer.innerHTML = `
        <div class="participant-item">
            <span class="participant-name">👤 ${currentUsername} (Siz)</span>
            <span class="participant-status">Faol</span>
        </div>
    `;

    for (let id in peers) {
        const name = peers[id].username || "Ishtirokchi";
        listContainer.innerHTML += `
            <div class="participant-item">
                <span class="participant-name">👤 ${name}</span>
                <span class="participant-status">Ulandi</span>
            </div>
        `;
    }
}

socket.on('all-users', async (users) => {
    for (let user of users) {
        const pc = createPeerConnection(user.id, user.username);
        peers[user.id] = { pc: pc, username: user.username };
        const activeStream = isSharingScreen && screenStream ? screenStream : localStream;
        if (activeStream) activeStream.getTracks().forEach(t => pc.addTrack(t, activeStream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { target: user.id, offer });
    }
    updateParticipantsList();
});

socket.on('user-joined', async ({ id, username }) => {
    addSystemMessage(`${username} xonaga qo'shildi.`);
    updateParticipantsList();
});

socket.on('offer', async ({ offer, sender, username }) => {
    let pcObj = peers[sender];
    let pc;
    if (!pcObj) {
        pc = createPeerConnection(sender, username);
        peers[sender] = { pc: pc, username: username || "Ishtirokchi" };
    } else {
        pc = pcObj.pc;
        pcObj.username = username || pcObj.username;
    }

    const activeStream = isSharingScreen && screenStream ? screenStream : localStream;
    if (activeStream && pc.getSenders().length === 0) {
        activeStream.getTracks().forEach(t => pc.addTrack(t, activeStream));
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { target: sender, answer });
    updateParticipantsList();
});

socket.on('answer', async ({ answer, sender }) => {
    if (peers[sender]?.pc) await peers[sender].pc.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on('ice-candidate', async ({ candidate, sender }) => {
    if (peers[sender]?.pc) await peers[sender].pc.addIceCandidate(new RTCIceCandidate(candidate));
});

socket.on('user-disconnected', (id) => {
    if (peers[id]) {
        peers[id].pc?.close();
        delete peers[id];
    }
    document.getElementById(`video-box-${id}`)?.remove();
    updateParticipantsList();
});

function createPeerConnection(id, username) {
    const pc = new RTCPeerConnection(iceConfig);
    pc.onicecandidate = e => { if (e.candidate) socket.emit('ice-candidate', { target: id, candidate: e.candidate }); };
    pc.ontrack = e => createRemoteVideoElement(id, username, e.streams[0]);
    return pc;
}

function createRemoteVideoElement(id, username, stream) {
    let videoBox = document.getElementById(`video-box-${id}`);
    if (!videoBox) {
        videoBox = document.createElement("div");
        videoBox.classList.add("video-box");
        videoBox.id = `video-box-${id}`;

        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.srcObject = stream;
        
        video.classList.add("screen-share-video");

        const label = document.createElement("span");
        label.classList.add("video-username");
        label.innerText = username || "Ishtirokchi";

        videoBox.appendChild(video);
        videoBox.appendChild(label);
        
        document.getElementById("video-grid").appendChild(videoBox);
    } else {
        const video = videoBox.querySelector("video");
        video.srcObject = stream;
        const label = videoBox.querySelector(".video-username");
        if (label) label.innerText = username || "Ishtirokchi";
    }
}

function sendMessage() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;
    socket.emit('chat-message', { room: currentRoom, username: currentUsername, text });
    input.value = "";
}

function checkChatEnter(e) { if (e.key === "Enter") sendMessage(); }

function addSystemMessage(text) {
    const chatBox = document.getElementById("chat-box");
    if (!chatBox) return;
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message");
    msgDiv.innerHTML = `<span>Tizim</span> ${text}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

socket.on('chat-message', (data) => {
    const chatBox = document.getElementById("chat-box");
    if (!chatBox) return;
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message");
    msgDiv.innerHTML = `<span>${data.username}</span> ${data.text}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
});

function leaveRoom() {
    if (!confirm("Haqiqatan ham darsdan chiqmoqchimisiz?")) return;
    localStream?.getTracks().forEach(t => t.stop());
    stopScreenShare();
    document.getElementById("room-screen").style.display = "none";
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("username-input").value = "";
}
