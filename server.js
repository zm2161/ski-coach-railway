require('dotenv').config();
const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化 Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 确保上传目录存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 配置 Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const videoId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${videoId}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp4', '.mov', '.avi', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件格式。仅支持 MP4, MOV, AVI, WEBM'));
    }
  }
});

// 中间件
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 获取视频元数据
function getVideoMetadata(videoPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        // 解析帧率 (格式: "30/1" 或 "30000/1001")
        let fps = 30;
        if (metadata.streams[0].r_frame_rate) {
          const [num, den] = metadata.streams[0].r_frame_rate.split('/').map(Number);
          if (den && den > 0) {
            fps = num / den;
          }
        }
        resolve({
          duration: metadata.format.duration,
          fps: fps
        });
      }
    });
  });
}

// 检测视频中的运动变化点（简化版：均匀分割）
function detectMotionChanges(duration, segmentCount = 5) {
  const segments = [];
  const segmentDuration = duration / segmentCount;
  
  for (let i = 0; i < segmentCount; i++) {
    const freezeAt = i * segmentDuration + segmentDuration / 2;
    segments.push({
      id: i + 1,
      freeze_at: Math.round(freezeAt * 10) / 10 // 保留一位小数
    });
  }
  
  return segments;
}

// 提取关键帧（用于AI分析）
function extractKeyFrame(videoPath, timestamp, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

// 调用 Gemini API 生成教练反馈（带重试机制）
async function generateCoachingFeedback(sport, terrain, segmentNumber, totalSegments, retries = 3) {
  const framework = sport === 'skiing' ? 'CSIA' : 'CASI';
  const sportName = sport === 'skiing' ? '双板滑雪' : '单板滑雪';
  
  const terrainMap = {
    'beginner': '平地/绿道（初级）',
    'intermediate': '蓝道（中级）',
    'advanced': '黑道（高级陡坡）',
    'moguls': '蘑菇道（雪包）',
    'freestyle': '自由式（公园、跳台）'
  };
  
  const prompt = `你是一位专业的${sportName}教练，使用${framework}教学框架。请分析这段视频片段（第${segmentNumber}/${totalSegments}段），地形为${terrainMap[terrain] || terrain}。

要求：
1. 生成一个5-10字的中文标题，概括这个片段的关键技术点
2. 提供3-5句话的详细反馈，包括：
   - 姿势分析
   - 技术问题
   - 改进建议
3. 语气要鼓励性、建设性
4. 使用简体中文
5. 根据地形给出针对性建议

请以JSON格式返回：
{
  "title": "标题",
  "text": "详细反馈内容"
}`;

  for (let i = 0; i < retries; i++) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // 尝试解析JSON（可能包含markdown代码块）
      let jsonText = text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim();
      }
      
      const coaching = JSON.parse(jsonText);
      return coaching;
    } catch (error) {
      console.error(`Gemini API 调用失败 (尝试 ${i + 1}/${retries}):`, error.message);
      if (i === retries - 1) {
        // 最后一次失败，返回默认反馈
        return {
          title: `片段 ${segmentNumber} 分析`,
          text: `这是第${segmentNumber}个视频片段。由于AI分析暂时不可用，请继续观看视频，注意保持平衡和正确的姿势。`
        };
      }
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// 生成练习推荐
async function generateRecommendations(sport, terrain, retries = 3) {
  const framework = sport === 'skiing' ? 'CSIA' : 'CASI';
  const sportName = sport === 'skiing' ? '双板滑雪' : '单板滑雪';
  
  const terrainMap = {
    'beginner': '平地/绿道（初级）',
    'intermediate': '蓝道（中级）',
    'advanced': '黑道（高级陡坡）',
    'moguls': '蘑菇道（雪包）',
    'freestyle': '自由式（公园、跳台）'
  };
  
  const prompt = `你是一位专业的${sportName}教练，使用${framework}教学框架。根据地形${terrainMap[terrain] || terrain}，推荐3-5个适合的练习。

要求：
1. 每个练习包含：
   - 练习名称（中英文）
   - 练习描述（2-3句话）
   - 关键要点（数组形式）
2. 使用简体中文
3. 根据地形针对性推荐

请以JSON格式返回：
{
  "recommendations": [
    {
      "name": "练习名称（中英文）",
      "description": "练习描述",
      "keyPoints": ["要点1", "要点2", "要点3"]
    }
  ]
}`;

  for (let i = 0; i < retries; i++) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // 尝试解析JSON
      let jsonText = text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/```\n?/g, '').trim();
      }
      
      const data = JSON.parse(jsonText);
      return data;
    } catch (error) {
      console.error(`生成练习推荐失败 (尝试 ${i + 1}/${retries}):`, error.message);
      if (i === retries - 1) {
        // 返回默认推荐
        return {
          recommendations: [
            {
              name: '基础平衡练习 (Basic Balance)',
              description: '在平地上练习保持平衡，这是所有技术的基础。',
              keyPoints: ['保持身体中心', '放松膝盖', '目视前方']
            }
          ]
        };
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

// API 端点：上传视频
app.post('/api/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传视频文件' });
    }

    const { sport, terrain } = req.body;
    if (!sport || !terrain) {
      return res.status(400).json({ error: '缺少运动类型或地形信息' });
    }

    const videoPath = req.file.path;
    const videoId = path.basename(req.file.filename, path.extname(req.file.filename));
    const videoUrl = `/uploads/${req.file.filename}`;

    // 获取视频元数据
    const metadata = await getVideoMetadata(videoPath);
    
    // 检测运动变化点（分割为5个片段）
    const segments = detectMotionChanges(metadata.duration, 5);

    // 为每个片段生成AI反馈
    const segmentsWithCoaching = await Promise.all(
      segments.map(async (segment) => {
        const coaching = await generateCoachingFeedback(
          sport,
          terrain,
          segment.id,
          segments.length
        );
        return {
          ...segment,
          coaching
        };
      })
    );

    res.json({
      success: true,
      videoId: videoId,
      videoUrl: videoUrl,
      segments: segmentsWithCoaching
    });
  } catch (error) {
    console.error('上传处理错误:', error);
    res.status(500).json({ error: '视频处理失败: ' + error.message });
  }
});

// API 端点：获取练习推荐
app.get('/api/video/:videoId/recommendations', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { sport, terrain } = req.query;

    if (!sport || !terrain) {
      return res.status(400).json({ error: '缺少运动类型或地形信息' });
    }

    const recommendations = await generateRecommendations(sport, terrain);
    res.json(recommendations);
  } catch (error) {
    console.error('生成推荐错误:', error);
    res.status(500).json({ error: '生成推荐失败: ' + error.message });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
});

