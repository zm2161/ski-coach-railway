// 从 sessionStorage 获取数据
const videoId = sessionStorage.getItem('videoId');
const videoUrl = sessionStorage.getItem('videoUrl');
const segmentsData = JSON.parse(sessionStorage.getItem('segments') || '[]');
const sport = sessionStorage.getItem('sport');
const terrain = sessionStorage.getItem('terrain');

// DOM 元素
const videoPlayer = document.getElementById('video-player');
const videoSource = document.getElementById('video-source');
const backBtn = document.getElementById('back-btn');
const coachingWindows = document.getElementById('coaching-windows');
const recommendationsSection = document.getElementById('recommendations-section');
const recommendationsList = document.getElementById('recommendations-list');

// 当前高亮的反馈窗口
let currentHighlightedWindow = null;

// 初始化
if (!videoId || !videoUrl || segmentsData.length === 0) {
    alert('缺少视频数据，请返回重新上传');
    window.location.href = 'index.html';
} else {
    initializeVideo();
    renderCoachingWindows();
}

// 初始化视频
function initializeVideo() {
    videoSource.src = videoUrl;
    videoPlayer.load();
    
    // 视频时间更新事件
    videoPlayer.addEventListener('timeupdate', handleTimeUpdate);
    
    // 视频结束事件
    videoPlayer.addEventListener('ended', handleVideoEnded);
}

// 处理视频时间更新
function handleTimeUpdate() {
    const currentTime = videoPlayer.currentTime;
    
    // 检查是否到达关键帧时间点（允许0.5秒误差）
    segmentsData.forEach(segment => {
        const timeDiff = Math.abs(currentTime - segment.freeze_at);
        if (timeDiff < 0.5 && !segment.shown) {
            segment.shown = true;
            showCoachingWindow(segment.id);
            // 自动暂停
            videoPlayer.pause();
        }
    });
}

// 显示教练反馈窗口
function showCoachingWindow(segmentId) {
    const window = document.getElementById(`coaching-window-${segmentId}`);
    if (window) {
        window.classList.add('active');
        window.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// 渲染所有教练反馈窗口
function renderCoachingWindows() {
    coachingWindows.innerHTML = '';
    
    // 按时间倒序排列（最新的在顶部）
    const sortedSegments = [...segmentsData].sort((a, b) => b.freeze_at - a.freeze_at);
    
    sortedSegments.forEach(segment => {
        const window = createCoachingWindow(segment);
        coachingWindows.appendChild(window);
    });
}

// 创建教练反馈窗口
function createCoachingWindow(segment) {
    const window = document.createElement('div');
    window.className = 'coaching-window';
    window.id = `coaching-window-${segment.id}`;
    window.dataset.segmentId = segment.id;
    window.dataset.freezeAt = segment.freeze_at;
    
    window.innerHTML = `
        <div class="coaching-header">
            <span class="coaching-time">${formatTime(segment.freeze_at)}</span>
            <span class="coaching-badge">片段 ${segment.id}</span>
        </div>
        <h3 class="coaching-title">${segment.coaching.title || '分析中...'}</h3>
        <p class="coaching-text">${segment.coaching.text || '正在生成反馈...'}</p>
    `;
    
    // 点击跳转到对应时间点
    window.addEventListener('click', () => {
        const freezeAt = parseFloat(window.dataset.freezeAt);
        videoPlayer.currentTime = freezeAt;
        
        // 高亮当前窗口
        if (currentHighlightedWindow) {
            currentHighlightedWindow.classList.remove('highlighted');
        }
        window.classList.add('highlighted');
        currentHighlightedWindow = window;
        
        // 播放视频
        videoPlayer.play();
    });
    
    return window;
}

// 格式化时间
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 处理视频结束
async function handleVideoEnded() {
    // 显示练习推荐区域
    recommendationsSection.classList.remove('hidden');
    
    // 如果还没有加载推荐，则加载
    if (recommendationsList.children.length === 0) {
        await loadRecommendations();
    }
}

// 加载练习推荐
async function loadRecommendations() {
    try {
        recommendationsList.innerHTML = '<p class="loading">正在生成推荐练习...</p>';
        
        const response = await fetch(`/api/video/${videoId}/recommendations?sport=${sport}&terrain=${terrain}`);
        const data = await response.json();
        
        if (data.recommendations && data.recommendations.length > 0) {
            renderRecommendations(data.recommendations);
        } else {
            recommendationsList.innerHTML = '<p class="no-data">暂无推荐练习</p>';
        }
    } catch (error) {
        console.error('加载推荐失败:', error);
        recommendationsList.innerHTML = '<p class="error">加载推荐失败，请刷新页面重试</p>';
    }
}

// 渲染练习推荐
function renderRecommendations(recommendations) {
    recommendationsList.innerHTML = '';
    
    recommendations.forEach((rec, index) => {
        const item = document.createElement('div');
        item.className = 'recommendation-item';
        
        item.innerHTML = `
            <h3 class="recommendation-name">${rec.name || `练习 ${index + 1}`}</h3>
            <p class="recommendation-description">${rec.description || ''}</p>
            ${rec.keyPoints && rec.keyPoints.length > 0 ? `
                <ul class="recommendation-points">
                    ${rec.keyPoints.map(point => `<li>${point}</li>`).join('')}
                </ul>
            ` : ''}
        `;
        
        recommendationsList.appendChild(item);
    });
}

// 返回按钮
backBtn.addEventListener('click', () => {
    // 清除 sessionStorage（可选，根据需求决定）
    // sessionStorage.clear();
    window.location.href = 'index.html';
});

