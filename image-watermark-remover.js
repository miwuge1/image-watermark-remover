/**
 * 腾讯云数据万象 ImageRepair 图片去水印工具
 * 
 * 使用方式:
 *   node image-watermark-remover.js <input_image> [output_image] [mask_image]
 * 
 * 示例:
 *   node image-watermark-remover.js input.jpg output.jpg mask.png
 *   node image-watermark-remover.js input.jpg output.jpg   # 自动生成遮罩（底部区域）
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const COS = require('cos-nodejs-sdk-v5');

// ============================================================
// 配置项（建议使用环境变量）
// ============================================================
const CONFIG = {
  secretId: process.env.TENCENT_SECRET_ID || 'your-secret-id',
  secretKey: process.env.TENCENT_SECRET_KEY || 'your-secret-key',
  region: process.env.TENCENT_REGION || 'ap-shanghai',
  bucket: process.env.TENCENT_BUCKET || 'your-bucket',
};

// 初始化 COS 客户端
const cos = new COS({
  SecretId: CONFIG.secretId,
  SecretKey: CONFIG.secretKey,
});

// ============================================================
// 工具函数
// ============================================================

/**
 * 生成带签名的 COS URL
 */
function getSignedUrl(key, expires = 7200) {
  return new Promise((resolve, reject) => {
    cos.getObjectUrl({
      Bucket: CONFIG.bucket,
      Region: CONFIG.region,
      Key: key,
      Expires: expires,
      sign: true,
    }, (err, data) => {
      if (err) reject(new Error(`生成签名 URL 失败: ${err.message}`));
      else resolve(data.Url);
    });
  });
}

/**
 * URL-safe Base64 编码
 */
function urlSafeBase64Encode(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * 上传文件到 COS
 */
function uploadToCOS(localFilePath, cosKey) {
  return new Promise((resolve, reject) => {
    cos.putObject({
      Bucket: CONFIG.bucket,
      Region: CONFIG.region,
      Key: cosKey,
      Body: fs.readFileSync(localFilePath),
    }, (err, data) => {
      if (err) reject(new Error(`上传失败: ${err.message}`));
      else resolve(data);
    });
  });
}

/**
 * 调用 ImageRepair API
 */
function callImageRepair(inputKey, maskKey) {
  return new Promise(async (resolve, reject) => {
    const host = `${CONFIG.bucket}.cos.${CONFIG.region}.myqcloud.com`;
    
    // 获取带签名的遮罩 URL
    let signedMaskUrl;
    try {
      signedMaskUrl = await getSignedUrl(maskKey, 7200);
    } catch (err) {
      reject(new Error(`获取遮罩签名 URL 失败: ${err.message}`));
      return;
    }
    
    const encodedMaskUrl = urlSafeBase64Encode(signedMaskUrl);
    
    // 构建请求
    const { getAuthorization } = require('cos-nodejs-sdk-v5');
    const query = {
      'ci-process': 'ImageRepair',
      'MaskPic': encodedMaskUrl
    };
    
    const auth = getAuthorization({
      SecretId: CONFIG.secretId,
      SecretKey: CONFIG.secretKey,
      Method: 'GET',
      Pathname: `/${inputKey}`,
      Query: query,
      Headers: { 'Host': host }
    });
    
    const queryStr = Object.keys(query)
      .map(k => `${k}=${encodeURIComponent(query[k])}`)
      .join('&');
    
    const options = {
      hostname: host,
      method: 'GET',
      path: `/${inputKey}?${queryStr}`,
      headers: { 'Host': host, 'Authorization': auth }
    };
    
    console.log('🔧 调用 ImageRepair API...');
    
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        
        if (res.statusCode === 200) {
          console.log('✅ ImageRepair 处理成功');
          resolve(buffer);
        } else {
          let errorMsg = `HTTP ${res.statusCode}`;
          try {
            const errorXml = buffer.toString();
            const msgMatch = errorXml.match(/<Message>(.*?)<\/Message>/);
            if (msgMatch) errorMsg = msgMatch[1];
          } catch {}
          reject(new Error(`ImageRepair 失败: ${errorMsg}`));
        }
      });
    });
    
    req.on('error', reject);
    req.end();
  });
}

/**
 * 下载图片
 */
function downloadImage(buffer, outputPath) {
  fs.writeFileSync(outputPath, buffer);
  console.log(`✅ 结果已保存: ${outputPath}`);
}

// ============================================================
// 主流程
// ============================================================

async function removeWatermark(inputPath, outputPath, maskPath) {
  const timestamp = Date.now();
  const inputFileName = path.basename(inputPath);
  const inputCosKey = `watermark-input/${timestamp}_${inputFileName}`;
  const maskCosKey = `watermark-mask/${timestamp}_${path.basename(maskPath || 'auto_mask.png')}`;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 图片去水印处理流程');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Step 1: 上传原图
  console.log('\n[1/4] 上传原图到 COS...');
  await uploadToCOS(inputPath, inputCosKey);
  console.log(`   路径: ${inputCosKey}`);

  // Step 2: 上传或生成遮罩图
  console.log('\n[2/4] 处理遮罩图...');
  
  if (maskPath) {
    // 使用用户提供的遮罩图
    await uploadToCOS(maskPath, maskCosKey);
    console.log(`   遮罩: ${maskCosKey} (用户指定)`);
  } else {
    // 生成自动遮罩（底部区域）
    console.log('   遮罩: 自动生成底部区域遮罩');
    const { Jimp } = require('jimp');
    const maskImg = await Jimp.read(inputPath);
    const { width, height } = maskImg;
    const maskHeight = Math.floor(height * 0.15); // 底部 15%
    
    // 创建遮罩（白色矩形在底部）
    for (let y = height - maskHeight; y < height; y++) {
      for (let x = 0; x < width; x++) {
        maskImg.setPixelColor(0xFFFFFFFF, x, y);
      }
    }
    
    const tempMaskPath = path.join(path.dirname(outputPath), 'temp_mask.png');
    await maskImg.write(tempMaskPath);
    await uploadToCOS(tempMaskPath, maskCosKey);
    fs.unlinkSync(tempMaskPath); // 删除临时文件
    console.log(`   遮罩: ${maskCosKey} (自动生成)`);
  }

  // Step 3: 调用 ImageRepair
  console.log('\n[3/4] 调用 ImageRepair 去水印...');
  const resultBuffer = await callImageRepair(inputCosKey, maskCosKey);

  // Step 4: 保存结果
  console.log('\n[4/4] 保存处理结果...');
  downloadImage(resultBuffer, outputPath);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 去水印处理完成！');
  console.log(`📁 输入: ${inputPath}`);
  console.log(`📁 输出: ${outputPath}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ============================================================
// 入口
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║     腾讯云 CI 图片去水印工具 (ImageRepair + MaskPic)     ║
╠══════════════════════════════════════════════════════════════╣
║  使用方式:                                               ║
║    node image-watermark-remover.js <输入图片> <输出图片> [遮罩图]  ║
║                                                              ║
║  示例:                                                     ║
║    # 自动遮罩（底部区域）                                   ║
║    node image-watermark-remover.js input.jpg output.jpg      ║
║                                                              ║
║    # 指定遮罩图                                             ║
║    node image-watermark-remover.js input.jpg output.jpg mask.png  ║
║                                                              ║
║  说明:                                                       ║
║    - 遮罩图: 白色区域表示要去除的部分                         ║
║    - 不指定遮罩图时，自动去除图片底部 15% 区域               ║
╚══════════════════════════════════════════════════════════════╝
    `);
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];
  const maskPath = args[2] || null;

  // 检查输入文件
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ 输入文件不存在: ${inputPath}`);
    process.exit(1);
  }

  if (maskPath && !fs.existsSync(maskPath)) {
    console.error(`❌ 遮罩文件不存在: ${maskPath}`);
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       腾讯云 CI 图片去水印处理                          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`📂 输入: ${inputPath}`);
  console.log(`📂 输出: ${outputPath}`);
  if (maskPath) {
    console.log(`📂 遮罩: ${maskPath}`);
  } else {
    console.log('📂 遮罩: 自动（底部15%区域）');
  }

  try {
    await removeWatermark(inputPath, outputPath, maskPath);
  } catch (error) {
    console.error('\n❌ 处理失败:', error.message);
    process.exit(1);
  }
}

main();
