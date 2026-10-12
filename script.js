const socket = io();

let currentUsername = "";
let currentRoom = "asosiy-xona";
let localStream = null;
let screenStream = null;
let cameraStream = null;
let isSharingScreen = false;
let peers = {}; 

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
    themeIcon.innerText = body.classList.contains("light-mode") ? "☀️" : "🌙";
}

// Sidebar tablarini almashtirish
function switchTab(tabName) {
    const chatTab = document.getElementById("chat-tab");
    const participantsTab = document.getElementById("participants-tab");
    const tabBtns = document.querySelectorAll(".tab-btn");

    tabBtns.forEach(btn => btn.classList.remove("active"));

    if (tabName === 'chat') {
        chatTab.style.display = "flex";
        participantsTab.style.display = "none";
        tabBtns[0].classList.add("active");
    } else {
        chatTab.style.display = "none";
        participantsTab.style.display = "flex";
        tabBtns[1].classList.add("active");
        updateParticipantsList();
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

    try {
        // Avval ilg'or audio sozlamalar bilan urinib ko'ramiz
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
    } catch (error1) {
        console.warn("Ilg'or audio sozlamalar ishlamadi, oddiy rejimga o'tamiz:", error1);
        try {
            // Agar filtrlar xato bersa, oddiy standart mikrofon va kamera bilan ulaymiz
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        } catch (error2) {
            console.error("Kamera yoki mikrofon topilmadi:", error2);
            alert("Mikrofon yoki kameraga ruxsat berilmadi yoki ular ulanmagan!");
        }
    }

    cameraStream = localStream;
    const localVideo = document.getElementById("local-video");
    if (localStream) {
        localVideo.srcObject = localStream;
    }

    socket.emit('join-room', currentUsername, currentRoom);

    document.getElementById("login-screen").style.display = "none";
    document.getElementById("room-screen").style.display = "flex";
    document.getElementById("room-screen").classList.add("fade-in");
    
    document.getElementById("placeholder").style.display = "none";
    addSystemMessage("Siz xonaga qo'shildingiz.");
    updateParticipantsList();
}

function checkLoginEnter(event) {
    if (event.key === "Enter") {
        joinRoom();
    }
}

// Mikrofonni yoqish/o'chirish
function toggleMic() {
    if (!localStream) {
        alert("Mikrofon topilmadi!");
        return;
    }
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

// Kamerani yoqish/o'chirish
function toggleCam() {
    if (!localStream) {
        alert("Kamera topilmadi!");
        return;
    }
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

// Ekran ulashni boshqarish
function toggleScreenShare() {
    if (!isSharingScreen) {
        startScreenShare();
    } else {
        stopScreenShare();
    }
}

// Ekran ulash funksiyasi
async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const screenTrack = screenStream.getVideoTracks()[0];

        const localVideo = document.getElementById("local-video");
        localVideo.srcObject = screenStream;

        for (let id in peers) {
            const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) {
                sender.replaceTrack(screenTrack);
            }
        }

        isSharingScreen = true;
        const shareBtn = document.getElementById("share-btn");
        shareBtn.innerText = "⏹ Ekranni to'xtatish";
        shareBtn.classList.add("active");
        addSystemMessage("Ekran ulash boshlandi.");

        screenTrack.onended = () => {
            stopScreenShare();
        };

    } catch (error) {
        console.error("Ekran ulashda xatolik:", error);
    }
}

// Ekran ulashni to'xtatish va kameraga qaytish
function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }

    if (cameraStream) {
        const videoTrack = cameraStream.getVideoTracks()[0];
        const localVideo = document.getElementById("local-video");
        localVideo.srcObject = cameraStream;

        for (let id in peers) {
            const sender = peers[id].pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender && videoTrack) {
                sender.replaceTrack(videoTrack);
            }
        }
    }

    isSharingScreen = false;
    const shareBtn = document.getElementById("share-btn");
    shareBtn.innerText = "🖥 Ekranni ulash";
    shareBtn.classList.remove("active");
    addSystemMessage("Ekran ulash to'xtatildi.");
}

// Darsni yozib olish (Recording)
async function toggleRecording() {
    const recBtn = document.getElementById("rec-btn");

    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { mediaSource: "screen" },
                audio: true 
            });

            recordedChunks = [];
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

            mediaRecorder.ondataavailable = function(event) {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = function() {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `dars-yozuvi-${new Date().toISOString().slice(0,10)}.webm`;
                document.body.appendChild(a);
                a.click();
                
                window.URL.revokeObjectURL(url);
                addSystemMessage("Dars yozuvi muvaffaqiyatli saqlandi va yuklab olindi!");
            };

            mediaRecorder.start();
            isRecording = true;
            recBtn.innerText = "⏹ Yozuvni to'xtatish";
            recBtn.classList.add("active");
            addSystemMessage("Dars yozib olina boshlandi...");

            stream.getVideoTracks()[0].onended = function() {
                if (isRecording) {
                    toggleRecording();
                }
            };

        } catch (error) {
            console.error("Yozib olishda xatolik:", error);
            alert("Ekran yozib olishga ruxsat berilmadi yoki xatolik yuz berdi.");
        }
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recBtn.innerText = "🔴 Yozib olish";
        recBtn.classList.remove("active");
    }
}

// Ishtirokchilar ro'yxatini haqiqiy ismlar bilan yangilash
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
        const participantName = peers[id].username || "Ishtirokchi";
        const item = document.createElement("div");
        item.classList.add("participant-item");
        item.innerHTML = `
            <span class="participant-name">👤 ${participantName}</span>
            <span class="participant-status">Ulandi</span>
        `;
        listContainer.appendChild(item);
    }
}

// Socket.io signallari va WebRTC
socket.on('user-joined', async ({ id, username }) => {
    addSystemMessage(`${username} xonaga qo'shildi.`);
    
    const pc = new RTCPeerConnection(iceConfig);
    peers[id] = { pc: pc, username: username };

    const activeStream = isSharingScreen && screenStream ? screenStream : localStream;
    if (activeStream) {
        activeStream.getTracks().forEach(track => pc.addTrack(track, activeStream));
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { target: id, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        createRemoteVideoElement(id, username, event.streams[0]);
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { target: id, offer });
    updateParticipantsList();
});

socket.on('offer', async ({ offer, sender, username }) => {
    const pc = new RTCPeerConnection(iceConfig);
    peers[sender] = { pc: pc, username: username || "Ishtirokchi" };

    const activeStream = isSharingScreen && screenStream ? screenStream : localStream;
    if (activeStream) {
        activeStream.getTracks().forEach(track => pc.addTrack(track, activeStream));
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', { target: sender, candidate: event.candidate });
        }
    };

    pc.ontrack = (event) => {
        createRemoteVideoElement(sender, username || "Ishtirokchi", event.streams[0]);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { target: sender, answer });
    updateParticipantsList();
});

socket.on('answer', async ({ answer, sender }) => {
    if (peers[sender] && peers[sender].pc) {
        await peers[sender].pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
});

socket.on('ice-candidate', async ({ candidate, sender }) => {
    if (peers[sender] && peers[sender].pc) {
        await peers[sender].pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
});

socket.on('user-disconnected', (id) => {
    if (peers[id]) {
        if (peers[id].pc) peers[id].pc.close();
        delete peers[id];
    }
    const videoBox = document.getElementById(`video-box-${id}`);
    if (videoBox) videoBox.remove();
    updateParticipantsList();
});

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

        const label = document.createElement("span");
        label.classList.add("video-username");
        label.innerText = username || "Ishtirokchi";

        videoBox.appendChild(video);
        videoBox.appendChild(label);
        document.getElementById("video-grid").appendChild(videoBox);
    } else {
        videoBox.querySelector("video").srcObject = stream;
        const label = videoBox.querySelector(".video-username");
        if (label) label.innerText = username || "Ishtirokchi";
    }
}

// Chat funksiyalari
function sendMessage() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;

    socket.emit('chat-message', {
        room: currentRoom,
        username: currentUsername,
        text: text
    });
    input.value = "";
}

function checkChatEnter(event) {
    if (event.key === "Enter") {
        sendMessage();
    }
}

function addSystemMessage(text) {
    const chatBox = document.getElementById("chat-box");
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message");
    msgDiv.innerHTML = `<span>Tizim</span> ${text}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

socket.on('chat-message', (data) => {
    const chatBox = document.getElementById("chat-box");
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("message");
    msgDiv.innerHTML = `<span>${data.username}</span> ${data.text}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
});

function leaveRoom() {
    const confirmed = confirm("Haqiqatan ham darsdan chiqmoqchimisiz?");
    if (!confirmed) return;

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    stopScreenShare();

    document.getElementById("room-screen").style.display = "none";
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("username-input").value = "";
}
