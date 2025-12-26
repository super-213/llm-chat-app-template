/**
 * 打字机风格的 AI 聊天应用
 */

// DOM 元素
const cardsContainer = document.getElementById('cards-container');
const typedText = document.getElementById('typed-text');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const statusEl = document.getElementById('status');

// 状态
let chatHistory = [];
let isProcessing = false;
let cardCounter = 0;

/* =========================
   输入系统
   ========================= */

// 初始化聚焦 textarea（关键）
userInput.focus();

// 点击页面任意位置，重新聚焦输入
document.addEventListener('click', () => {
	userInput.focus();
});

// 同步 textarea → 打字机屏幕
userInput.addEventListener('input', () => {
	if (isProcessing) return;
	typedText.textContent = userInput.value;
});

// 只处理 Enter
userInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') {
		e.preventDefault();
		sendMessage();
	}
});

// 发送按钮
sendButton.addEventListener('click', sendMessage);

/* =========================
   发送消息
   ========================= */

async function sendMessage() {
	const message = userInput.value.trim();
	if (!message || isProcessing) return;

	isProcessing = true;
	sendButton.disabled = true;
	statusEl.textContent = '处理中 ● 工作';

	// 清空输入
	userInput.value = '';
	typedText.textContent = '';

	chatHistory.push({ role: 'user', content: message });

	try {
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ messages: chatHistory }),
		});

		if (!response.ok || !response.body) {
			throw new Error('请求失败');
		}

		const card = createResponseCard();
		const cardContent = card.querySelector('.card-content');

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let responseText = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;

			for (const data of parsed.events) {
				if (data === '[DONE]') break;

				try {
					const json = JSON.parse(data);
					const content =
						json.response ??
						json.choices?.[0]?.delta?.content ??
						'';

					if (content) {
						responseText += content;
						cardContent.textContent += content;
					}
				} catch (err) {
					console.error('SSE 解析失败', err);
				}
			}
		}

		if (responseText) {
			chatHistory.push({ role: 'assistant', content: responseText });
		}

	} catch (err) {
		console.error(err);
		const card = createResponseCard();
		card.querySelector('.card-content').textContent =
			'抱歉，处理请求时出现错误。';
	} finally {
		isProcessing = false;
		sendButton.disabled = false;
		statusEl.textContent = '就绪 ● 在线';
		userInput.focus();
	}
}

/* =========================
   UI / 卡片相关
   ========================= */

function createResponseCard() {
	cardCounter++;

	const card = document.createElement('div');
	card.className = 'response-card';

	const x = Math.random() < 0.5
		? Math.random() * 200 + 50
		: window.innerWidth - Math.random() * 200 - 350;

	const y = Math.random() * (window.innerHeight - 500) + 50;

	card.style.left = x + 'px';
	card.style.top = y + 'px';

	const now = new Date();
	const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(
		now.getDate()
	).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
		now.getMinutes()
	).padStart(2, '0')}`;

	card.innerHTML = `
		<div class="card-header">
			<div class="card-title">回复消息</div>
			<div class="card-meta">${dateStr}</div>
		</div>
		<div class="card-content"></div>
		<div class="card-footer">END OF TRANSMISSION</div>
	`;

	cardsContainer.appendChild(card);
	makeDraggable(card);
	return card;
}

function makeDraggable(el) {
	let x1 = 0, y1 = 0, x2 = 0, y2 = 0;

	el.onmousedown = (e) => {
		e.preventDefault();
		x2 = e.clientX;
		y2 = e.clientY;
		document.onmouseup = stopDrag;
		document.onmousemove = drag;
		el.style.zIndex = getHighestZIndex() + 1;
	};

	function drag(e) {
		e.preventDefault();
		x1 = x2 - e.clientX;
		y1 = y2 - e.clientY;
		x2 = e.clientX;
		y2 = e.clientY;
		el.style.top = el.offsetTop - y1 + 'px';
		el.style.left = el.offsetLeft - x1 + 'px';
	}

	function stopDrag() {
		document.onmouseup = null;
		document.onmousemove = null;
	}
}

function getHighestZIndex() {
	return Math.max(
		0,
		...Array.from(document.querySelectorAll('.response-card')).map(
			(el) => parseInt(getComputedStyle(el).zIndex) || 0
		)
	);
}

/* =========================
   SSE 解析
   ========================= */

function consumeSseEvents(buffer) {
	const events = [];
	let idx;

	buffer = buffer.replace(/\r/g, '');

	while ((idx = buffer.indexOf('\n\n')) !== -1) {
		const chunk = buffer.slice(0, idx);
		buffer = buffer.slice(idx + 2);

		const lines = chunk.split('\n');
		const data = lines
			.filter((l) => l.startsWith('data:'))
			.map((l) => l.slice(5).trimStart())
			.join('\n');

		if (data) events.push(data);
	}

	return { events, buffer };
}

console.log('打字机聊天系统已就绪');