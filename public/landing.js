// 状态管理
let selectedSport = null;
let selectedTerrain = null;
let selectedFile = null;

// DOM 元素
const sportSelection = document.getElementById('sport-selection');
const terrainSelection = document.getElementById('terrain-selection');
const uploadSection = document.getElementById('upload-section');
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const selectBtn = document.getElementById('select-btn');
const fileInfo = document.getElementById('file-info');
const fileName = document.getElementById('file-name');
const fileSize = document.getElementById('file-size');
const uploadBtn = document.getElementById('upload-btn');
const cancelBtn = document.getElementById('cancel-btn');
const progressSection = document.getElementById('progress-section');
const progressFill = document.getElementById('progress-fill');
const progressText = document.getElementById('progress-text');
const progressPercent = document.getElementById('progress-percent');
const errorMessage = document.getElementById('error-message');
const errorText = document.getElementById('error-text');
const retryBtn = document.getElementById('retry-btn');

// 运动选择
document.querySelectorAll('.sport-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        selectedSport = btn.dataset.sport;
        document.querySelectorAll('.sport-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 显示地形选择
        terrainSelection.classList.remove('hidden');
        
        // 存储到 sessionStorage
        sessionStorage.setItem('sport', selectedSport);
    });
});

// 地形选择
document.querySelectorAll('input[name="terrain"]').forEach(radio => {
    radio.addEventListener('change', () => {
        if (radio.checked) {
            selectedTerrain = radio.value;
            sessionStorage.setItem('terrain', selectedTerrain);
            
            // 显示上传区域
            uploadSection.classList.remove('hidden');
        }
    });
});

// 文件选择按钮
selectBtn.addEventListener('click', () => {
    fileInput.click();
});

// 文件输入变化
fileInput.addEventListener('change', (e) => {
    handleFileSelect(e.target.files[0]);
});

// 拖拽上传
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const file = e.dataTransfer.files[0];
    if (file) {
        handleFileSelect(file);
    }
});

// 处理文件选择
function handleFileSelect(file) {
    if (!file) return;
    
    // 验证文件类型（主要依赖扩展名，因为 MIME 类型在不同浏览器可能不同）
    const allowedExtensions = ['.mp4', '.mov', '.avi', '.webm'];
    const allowedMimeTypes = ['video/mp4', 'video/mov', 'video/quicktime', 'video/avi', 'video/x-msvideo', 'video/webm'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    
    // 检查扩展名或 MIME 类型
    const isValidExtension = allowedExtensions.includes(fileExt);
    const isValidMimeType = allowedMimeTypes.includes(file.type);
    
    if (!isValidExtension && !isValidMimeType) {
        showError('不支持的文件格式。仅支持 MP4, MOV, AVI, WEBM');
        return;
    }
    
    // 验证文件大小（100MB）
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
        showError('文件大小超过 100MB 限制');
        return;
    }
    
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    
    uploadArea.classList.add('hidden');
    fileInfo.classList.remove('hidden');
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 取消选择
cancelBtn.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    uploadArea.classList.remove('hidden');
});

// 上传文件
uploadBtn.addEventListener('click', async () => {
    if (!selectedFile || !selectedSport || !selectedTerrain) {
        showError('请完成所有步骤：选择运动、地形和视频文件');
        return;
    }
    
    await uploadVideo();
});

// 上传视频函数
async function uploadVideo() {
    hideError();
    
    const formData = new FormData();
    formData.append('video', selectedFile);
    formData.append('sport', selectedSport);
    formData.append('terrain', selectedTerrain);
    
    // 显示进度
    progressSection.classList.remove('hidden');
    progressFill.style.width = '0%';
    progressPercent.textContent = '0%';
    progressText.textContent = '上传中...';
    
    try {
        const xhr = new XMLHttpRequest();
        
        // 上传进度
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressFill.style.width = percent + '%';
                progressPercent.textContent = percent + '%';
            }
        });
        
        // 处理响应
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                handleUploadSuccess(data);
            } else {
                const error = JSON.parse(xhr.responseText);
                showError(error.error || '上传失败');
                progressSection.classList.add('hidden');
            }
        });
        
        xhr.addEventListener('error', () => {
            showError('网络错误，请检查连接后重试');
            progressSection.classList.add('hidden');
        });
        
        progressText.textContent = '处理中...';
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
        
    } catch (error) {
        showError('上传失败: ' + error.message);
        progressSection.classList.add('hidden');
    }
}

// 处理上传成功
function handleUploadSuccess(data) {
    if (!data.success) {
        showError('上传失败');
        return;
    }
    
    // 存储数据到 sessionStorage
    sessionStorage.setItem('videoId', data.videoId);
    sessionStorage.setItem('videoUrl', data.videoUrl);
    sessionStorage.setItem('segments', JSON.stringify(data.segments));
    sessionStorage.setItem('sport', selectedSport);
    sessionStorage.setItem('terrain', selectedTerrain);
    
    progressText.textContent = '分析完成！正在跳转...';
    progressFill.style.width = '100%';
    progressPercent.textContent = '100%';
    
    // 跳转到分析页面
    setTimeout(() => {
        window.location.href = 'analyze.html';
    }, 1000);
}

// 显示错误
function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
}

// 隐藏错误
function hideError() {
    errorMessage.classList.add('hidden');
}

// 重试按钮
retryBtn.addEventListener('click', () => {
    hideError();
    if (selectedFile) {
        uploadVideo();
    }
});

// 页面加载时恢复状态
window.addEventListener('load', () => {
    const savedSport = sessionStorage.getItem('sport');
    if (savedSport) {
        const btn = document.querySelector(`[data-sport="${savedSport}"]`);
        if (btn) {
            btn.click();
        }
    }
    
    const savedTerrain = sessionStorage.getItem('terrain');
    if (savedTerrain) {
        const radio = document.querySelector(`input[value="${savedTerrain}"]`);
        if (radio) {
            radio.checked = true;
            radio.dispatchEvent(new Event('change'));
        }
    }
});

