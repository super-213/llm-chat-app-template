/**
 * 打字机风格的AI聊天应用
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
let currentTypingText = '';
let typingIndex = 0;
let typingInterval = null;
let cardCounter = 0;

// 监听键盘输入
document.addEventListener('keydown', (e) => {
	if (isProcessing) return;
	
	// 忽略特殊键
	if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') {
		return;
	}
	
	// Enter 键发送消息
	if (e.key === 'Enter') {
		e.preventDefault();
		sendMessage();
		return;
	}
	
	// Backspace 删除
	if (e.key === 'Backspace') {
		e.preventDefault();
		if (currentTypingText.length > 0) {
			currentTypingText = currentTypingText.slice(0, -1);
			typedText.textContent = currentTypingText;
		}
		return;
	}
	
	// 普通字符输入
	if (e.key.length === 1) {
		currentTypingText += e.key;
		typedText.textContent = currentTypingText;
	}
});

// 发送按钮点击
sendButton.addEventListener('click', sendMessage);

/**
 * 发送消息
 */
async function sendMessage() {
	const message = currentTypingText.trim();
	
	if (message === '' || isProcessing) return;
	
	// 禁用输入
	isProcessing = true;
	sendButton.disabled = true;
	statusEl.textContent = '处理中 ● 工作';
	
	// 保存用户消息
	const userMessage = message;
	currentTypingText = '';
	typedText.textContent = '';
	
	// 添加到历史
	chatHistory.push({ role: 'user', content: userMessage });
	
	try {
		// 发送请求
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				messages: chatHistory,
			}),
		});
		
		if (!response.ok) {
			throw new Error('请求失败');
		}
		
		if (!response.body) {
			throw new Error('响应体为空');
		}
		
		// 创建新卡片
		const card = createResponseCard();
		const cardContent = card.querySelector('.card-content');
		
		// 处理流式响应
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let responseText = '';
		let buffer = '';
		
		while (true) {
			const { done, value } = await reader.read();
			
			if (done) {
				const parsed = consumeSseEvents(buffer + '\n\n');
				for (const data of parsed.events) {
					if (data === '[DONE]') break;
					try {
						const jsonData = JSON.parse(data);
						let content = '';
						if (typeof jsonData.response === 'string' && jsonData.response.length > 0) {
							content = jsonData.response;
						} else if (jsonData.choices?.[0]?.delta?.content) {
							content = jsonData.choices[0].delta.content;
						}
						if (content) {
							responseText += content;
							typeTextToCard(cardContent, content);
						}
					} catch (e) {
						console.error('解析错误:', e);
					}
				}
				break;
			}
			
			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			
			for (const data of parsed.events) {
				if (data === '[DONE]') {
					buffer = '';
					break;
				}
				try {
					const jsonData = JSON.parse(data);
					let content = '';
					if (typeof jsonData.response === 'string' && jsonData.response.length > 0) {
						content = jsonData.response;
					} else if (jsonData.choices?.[0]?.delta?.content) {
						content = jsonData.choices[0].delta.content;
					}
					if (content) {
						responseText += content;
						typeTextToCard(cardContent, content);
					}
				} catch (e) {
					console.error('解析错误:', e);
				}
			}
		}
		
		// 添加到历史
		if (responseText.length > 0) {
			chatHistory.push({ role: 'assistant', content: responseText });
		}
		
	} catch (error) {
		console.error('错误:', error);
		const card = createResponseCard();
		card.querySelector('.card-content').textContent = '抱歉，处理请求时出现错误。';
	} finally {
		isProcessing = false;
		sendButton.disabled = false;
		statusEl.textContent = '就绪 ● 在线';
	}
}

/**
 * 创建响应卡片
 */
function createResponseCard() {
	cardCounter++;
	
	const card = document.createElement('div');
	card.className = 'response-card';
	
	// 随机位置（避开中间的打字机区域）
	const x = Math.random() < 0.5 
		? Math.random() * 200 + 50  // 左侧
		: window.innerWidth - Math.random() * 200 - 350; // 右侧
	const y = Math.random() * (window.innerHeight - 500) + 50;
	
	card.style.left = x + 'px';
	card.style.top = y + 'px';
	
	// 获取当前时间
	const now = new Date();
	const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
	
	card.innerHTML = `
		<div class="card-header">
			<div class="card-title">分页消息</div>
			<div class="card-meta">${dateStr}</div>
		</div>
		<div class="card-content"></div>
		<div class="card-footer">END OF TRANSMISSION</div>
	`;
	
	cardsContainer.appendChild(card);
	
	// 使卡片可拖动
	makeDraggable(card);
	
	return card;
}

/**
 * 打字机效果添加文本到卡片
 */
function typeTextToCard(element, text) {
	element.textContent += text;
}

/**
 * 使元素可拖动
 */
function makeDraggable(element) {
	let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
	
	element.onmousedown = dragMouseDown;
	
	function dragMouseDown(e) {
		e.preventDefault();
		pos3 = e.clientX;
		pos4 = e.clientY;
		document.onmouseup = closeDragElement;
		document.onmousemove = elementDrag;
		element.style.zIndex = getHighestZIndex() + 1;
	}
	
	function elementDrag(e) {
		e.preventDefault();
		pos1 = pos3 - e.clientX;
		pos2 = pos4 - e.clientY;
		pos3 = e.clientX;
		pos4 = e.clientY;
		element.style.top = (element.offsetTop - pos2) + 'px';
		element.style.left = (element.offsetLeft - pos1) + 'px';
	}
	
	function closeDragElement() {
		document.onmouseup = null;
		document.onmousemove = null;
	}
}

/**
 * 获取最高的 z-index
 */
function getHighestZIndex() {
	const cards = document.querySelectorAll('.response-card');
	let highest = 0;
	cards.forEach(card => {
		const z = parseInt(window.getComputedStyle(card).zIndex) || 0;
		if (z > highest) highest = z;
	});
	return highest;
}

/**
 * 解析 SSE 事件
 */
function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, '');
	const events = [];
	let eventEndIndex;
	
	while ((eventEndIndex = normalized.indexOf('\n\n')) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);
		
		const lines = rawEvent.split('\n');
		const dataLines = [];
		for (const line of lines) {
			if (line.startsWith('data:')) {
				dataLines.push(line.slice('data:'.length).trimStart());
			}
		}
		if (dataLines.length === 0) continue;
		events.push(dataLines.join('\n'));
	}
	
	return { events, buffer: normalized };
}

// 初始化
console.log('打字机聊天系统已就绪');
